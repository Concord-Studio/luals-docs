import { parseLua } from "./lua-source.js";
import { type ParsedFieldTag, parseFieldTag } from "./type-parse-utils.js";

export type { FieldScope, ParsedFieldTag } from "./type-parse-utils.js";

export interface ParsedType {
	kind: "class" | "alias";
	name: string;
	summary: string;
	description: string;
	extends?: string;
	/** Alias body (everything after the name on the `@alias` line). */
	definition?: string;
	fields: ParsedFieldTag[];
	deprecated: boolean;
}

function parseTagLine(tag: string): { kind: string; rest: string } {
	const m = tag.match(/^@(\w+)\s*(.*)$/);
	return { kind: m?.[1] ?? "", rest: m?.[2]?.trim() ?? "" };
}

function flushProse(prose: string[]): { summary: string; description: string } {
	const nonEmpty = prose.map((l) => l.trim()).filter(Boolean);
	if (!nonEmpty.length) return { summary: "", description: "" };
	return {
		summary: nonEmpty[0] ?? "",
		description: nonEmpty.slice(1).join("\n"),
	};
}

function parseClassRest(rest: string): { name: string; extends?: string } {
	const m = rest.match(/^(\S+?)(?:\s*:\s*(\S+))?$/);
	const name = m?.[1]?.replace(/:.+$/, "") ?? rest.split(/\s+/)[0] ?? "";
	const extendsBase =
		m?.[2] ?? (rest.includes(":") ? rest.split(":")[1]?.trim() : undefined);
	return { name, extends: extendsBase };
}

/**
 * Parse `@class` / `@alias` / `@field` from the file's leading `---` comment block.
 */
export function parseTypesFromHeaderLines(lines: string[]): ParsedType[] {
	const types: ParsedType[] = [];
	let current: ParsedType | null = null;
	let pendingProse: string[] = [];

	const pushCurrent = () => {
		if (current && !current.deprecated) {
			types.push(current);
		}
		current = null;
	};

	for (const line of parseLua(lines.join("\n")).headerLines) {
		const t = line.replace(/^---\s?/, "").trimEnd();
		if (!t.startsWith("@")) {
			if (t.trim()) pendingProse.push(t.trim());
			continue;
		}

		const { kind, rest } = parseTagLine(t);
		if (kind === "class") {
			pushCurrent();
			const deprecated = /@deprecated\b/i.test(t);
			const { name, extends: extendsBase } = parseClassRest(
				rest.replace(/\s*@deprecated\b.*$/i, "").trim(),
			);
			const { summary, description } = flushProse(pendingProse);
			pendingProse = [];
			current = {
				kind: "class",
				name,
				summary,
				description,
				extends: extendsBase,
				fields: [],
				deprecated,
			};
			continue;
		}

		if (kind === "alias") {
			pushCurrent();
			const deprecated = /@deprecated\b/i.test(t);
			const clean = rest.replace(/\s*@deprecated\b.*$/i, "").trim();
			const nameMatch = clean.match(/^(\S+)\s*(.*)$/s);
			const name = nameMatch?.[1] ?? clean;
			const definition = nameMatch?.[2]?.trim() ?? "";
			const { summary, description } = flushProse(pendingProse);
			pendingProse = [];
			types.push({
				kind: "alias",
				name,
				summary,
				description,
				definition,
				fields: [],
				deprecated,
			});
			continue;
		}

		if (kind === "field" && current?.kind === "class") {
			const field = parseFieldTag(t);
			if (field && !field.deprecated) {
				current.fields.push(field);
			}
		}
	}

	pushCurrent();
	return types;
}
