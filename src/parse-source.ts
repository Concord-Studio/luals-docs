import { readFileSync } from "node:fs";
import path from "node:path";
import { defaultRouteSlug, outputMdRelPath } from "./barrel-md.js";
import type { ResolvedConfig } from "./config.js";
import {
	applyIndexSlugDefault,
	collectHeaderTagLines,
	type PageDocsMeta,
	parseDocsMetaFromHeaderTags,
	titleFromBasename,
} from "./docs-meta.js";
import { assertOneIndexPerFolder } from "./index-scope.js";
import { parseLua } from "./lua-source.js";
import { type ParsedType, parseTypesFromHeaderLines } from "./parse-types.js";
import { mergeUsageBlocks } from "./parse-usage.js";
import {
	parseParam,
	parseReturnTag,
	stripNamespacePrefix,
} from "./type-parse-utils.js";

export type { ParsedType } from "./parse-types.js";

export interface ParsedOverload {
	signature: string;
	description: string;
}

export type MemberCallSeparator = ":" | ".";

export interface ParsedMember {
	name: string;
	/** From `function Owner:method` vs `function Owner.method` in source. */
	callSeparator: MemberCallSeparator;
	signature: string;
	summary: string;
	description: string;
	/** Lua snippets from `---@usage` or `--[[@usage ... ]]`. */
	usageBlocks: string[];
	params: { name: string; types: string; desc: string }[];
	returns: { name: string; types: string; desc: string }[];
	overloads: ParsedOverload[];
	see: string[];
}

export interface ParsedExport {
	name: string;
	types: string;
	description: string;
	deprecated: boolean;
}

export interface ParsedPage {
	title: string;
	relFile: string;
	outputRelPath: string;
	routeSlug: string;
	kind: string;
	docs: PageDocsMeta;
	className?: string;
	moduleName?: string;
	summary: string;
	exports: ParsedExport[];
	types: ParsedType[];
	members: ParsedMember[];
}

function parseTagLine(tag: string): { kind: string; rest: string } {
	const m = tag.match(/^@(\w+)\s*(.*)$/);
	return { kind: m?.[1] ?? "", rest: m?.[2]?.trim() ?? "" };
}

function exportsFromTypes(
	types: ParsedType[],
	className: string | undefined,
): ParsedExport[] {
	if (!className) return [];
	const classType = types.find(
		(t) => t.kind === "class" && t.name === className,
	);
	if (!classType) return [];
	return classType.fields
		.filter(
			(f) =>
				!f.deprecated && !f.name.startsWith("_") && !f.name.startsWith("["),
		)
		.map((f) => ({
			name: f.name.replace(/\?$/, ""),
			types: f.types,
			description: f.desc,
			deprecated: false,
		}));
}

/** Ordered walk: shared prose before any `@`, prose after each `@overload` until next `@`. */
function parseMemberDocBlock(lines: string[]): {
	summary: string;
	sharedProse: string[];
	overloads: ParsedOverload[];
	tags: string[];
	usageBlocks: string[];
} {
	const tags: string[] = [];
	const sharedProse: string[] = [];
	const usageBlocks: string[] = [];
	const overloadSlots: { signature: string; prose: string[] }[] = [];
	let summary = "";
	let overloadProseTarget: string[] | null = null;
	let usageProseTarget: string[] | null = null;
	let seenAnyTag = false;

	const flushUsage = () => {
		if (usageProseTarget) {
			const block = usageProseTarget.join("\n").trim();
			if (block) usageBlocks.push(block);
			usageProseTarget = null;
		}
	};

	for (const line of lines) {
		const t = line.replace(/^---\s?/, "").trimEnd();
		if (t.startsWith("@")) {
			seenAnyTag = true;
			const { kind, rest } = parseTagLine(t);
			if (kind === "overload") {
				flushUsage();
				const prose: string[] = [];
				overloadSlots.push({ signature: rest, prose });
				overloadProseTarget = prose;
				continue;
			}
			if (kind === "usage") {
				flushUsage();
				overloadProseTarget = null;
				if (rest.trim()) {
					usageBlocks.push(rest.trim());
				} else {
					usageProseTarget = [];
				}
				continue;
			}
			flushUsage();
			overloadProseTarget = null;
			tags.push(t);
			continue;
		}
		if (!t.length) continue;
		if (usageProseTarget) {
			usageProseTarget.push(t);
		} else if (overloadProseTarget) {
			overloadProseTarget.push(t);
		} else if (!seenAnyTag) {
			if (!summary) summary = t;
			else sharedProse.push(t);
		} else {
			sharedProse.push(t);
		}
	}

	flushUsage();

	const overloads = overloadSlots.map((o) => ({
		signature: o.signature,
		description: o.prose.join("\n"),
	}));

	return { summary, sharedProse, overloads, tags, usageBlocks };
}

function memberFromMemberDoc(
	fnName: string,
	signature: string,
	doc: ReturnType<typeof parseMemberDocBlock>,
	namespace: string | undefined,
): Omit<ParsedMember, "callSeparator"> {
	const params: ParsedMember["params"] = [];
	const returns: ParsedMember["returns"] = [];
	const see: string[] = [];

	for (const tag of doc.tags) {
		const { kind, rest } = parseTagLine(tag);
		if (kind === "param") {
			const param = parseParam(rest);
			params.push({
				...param,
				types: stripNamespacePrefix(param.types, namespace),
			});
		} else if (kind === "return") {
			const parsed = parseReturnTag(rest);
			returns.push({
				name: parsed.name,
				types: stripNamespacePrefix(parsed.types, namespace),
				desc: parsed.desc,
			});
		} else if (kind === "see") see.push(stripNamespacePrefix(rest, namespace));
	}

	return {
		name: fnName,
		signature,
		summary: doc.summary,
		description: doc.sharedProse.join("\n"),
		usageBlocks: doc.usageBlocks,
		params,
		returns,
		overloads: doc.overloads.map((overload) => ({
			...overload,
			signature: stripNamespacePrefix(overload.signature, namespace),
		})),
		see,
	};
}

function isDocsTagLine(line: string): boolean {
	const t = line.replace(/^---\s?/, "").trim();
	return t.startsWith("@docs");
}

function parseFileHeader(
	headerLines: string[],
	namespace: string | undefined,
): {
	docs: PageDocsMeta;
	className?: string;
	moduleName?: string;
	fileSummary: string;
	exports: ParsedExport[];
	types: ParsedType[];
} {
	const collected = collectHeaderTagLines(headerLines);
	const { tagLines } = collected;
	const className = collected.className
		? stripNamespacePrefix(collected.className, namespace)
		: undefined;
	const docs = parseDocsMetaFromHeaderTags(tagLines);

	let moduleName: string | undefined;
	for (const line of tagLines) {
		const t = line.replace(/^---\s?/, "");
		const { kind, rest } = parseTagLine(t);
		if (kind === "module") {
			const m = rest.match(/^['"]?([^'"]+)['"]?/);
			if (m?.[1]) moduleName = m[1];
		}
	}

	let fileSummary = "";
	for (const headerLine of tagLines) {
		const t = headerLine.replace(/^---\s?/, "");
		if (isDocsTagLine(headerLine)) continue;
		if (t.startsWith("@")) continue;
		if (t.startsWith("##")) {
			/* prose in header */
		} else if (t.trim()) {
			if (!fileSummary) fileSummary = t.trim();
		}
	}

	const types = parseTypesFromHeaderLines(headerLines, namespace);
	const exports = exportsFromTypes(types, className);

	return {
		docs,
		className,
		moduleName,
		fileSummary,
		exports,
		types,
	};
}

export function parseSourcePages(config: ResolvedConfig): ParsedPage[] {
	const root = config.workspaceRoot;
	const pages: ParsedPage[] = [];
	for (const relFile of config.pages) {
		const full = path.join(root, relFile);
		const text = readFileSync(full, "utf8");
		const lua = parseLua(text);

		const header = parseFileHeader(lua.headerLines, config.namespace);
		if (!header.docs.enabled) continue;

		const docs = applyIndexSlugDefault(
			relFile,
			config.inputDir,
			config.routePrefix,
			header.docs,
		);

		if (!docs.kind) {
			throw new Error(`${relFile}: missing ---@docs kind`);
		}

		const title =
			docs.title ??
			header.className ??
			header.moduleName ??
			titleFromBasename(relFile);

		const routeSlug =
			docs.slug ??
			defaultRouteSlug(relFile, config.routePrefix, config.inputDir);

		const members: ParsedMember[] = [];

		for (const fn of lua.functions) {
			if (fn.docLines.length === 0) continue;

			const memberDoc = parseMemberDocBlock(fn.docLines);
			if (memberDoc.tags.some((t) => parseTagLine(t).kind === "private")) {
				continue;
			}
			if (memberDoc.tags.some((t) => parseTagLine(t).kind === "deprecated")) {
				continue;
			}

			const member = memberFromMemberDoc(
				fn.name,
				fn.signature,
				memberDoc,
				config.namespace,
			);
			member.usageBlocks = mergeUsageBlocks(member.usageBlocks, fn.blockUsages);
			members.push({
				...member,
				callSeparator: fn.callSeparator,
			});
		}

		pages.push({
			title,
			relFile,
			outputRelPath: outputMdRelPath(relFile, config.inputDir),
			routeSlug,
			kind: docs.kind,
			docs,
			className: header.className,
			moduleName: header.moduleName,
			summary: header.fileSummary,
			exports: header.exports,
			types: header.types,
			members,
		});
	}

	const allowedKinds = new Set(config.groups.flatMap((group) => group.kinds));
	for (const page of pages) {
		if (!allowedKinds.has(page.kind)) {
			throw new Error(
				`${page.relFile}: ---@docs kind "${page.kind}" is not listed in any groups entry`,
			);
		}
	}

	assertOneIndexPerFolder(pages, config.inputDir);

	return pages;
}
