import {
	existsSync,
	mkdirSync,
	readdirSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import {
	anchor,
	apiHref,
	luaRequireModuleId,
	memberDisplayLabel,
	memberOutputRelPath,
	memberRouteSlug,
	typeOutputRelPath,
	typeRouteSlug,
} from "./barrel-md.js";
import type { ResolvedConfig } from "./config.js";
import { writeIndexJson } from "./index-json.js";
import { buildManifestForScope, collectIndexScope } from "./index-scope.js";
import type { ParsedPage } from "./parse-source.js";
import { parseSourcePages } from "./parse-source.js";
import { pageSummaries, renderApiIndex } from "./render-api-index.js";
import {
	memberSummaryForPage,
	methodRows,
	renderMember,
} from "./render-member.js";
import {
	renderPrimaryExportSection,
	renderTypeLeaf,
	typeRows,
	typeSummaryForPage,
} from "./render-types.js";
import { buildSeeIndex } from "./see-index.js";
import { loadTemplates, renderDocument, type Templates } from "./templates.js";
import {
	buildTypeIndex,
	isPrimaryPageType,
	type TypeIndex,
} from "./type-index.js";

export interface GenerateOptions {
	config: ResolvedConfig;
	outDir?: string;
	indexJson?: string;
}

export interface Manifest {
	groups: ManifestGroup[];
	symbolIndex: Record<string, string>;
}

export interface ManifestGroup {
	label: string;
	items?: ManifestItem[];
}

export interface ManifestItem {
	label: string;
	slug: string;
}

function requireBindingName(page: ParsedPage): string {
	return page.moduleName ?? page.className ?? page.title;
}

function renderPageBody(
	page: ParsedPage,
	typeIndex: TypeIndex,
	templates: Templates,
	indexBlock?: string,
): string {
	const primaryType = page.className
		? page.types.find((t) => t.kind === "class" && t.name === page.className)
		: undefined;
	const primary = primaryType
		? renderPrimaryExportSection(
				primaryType,
				typeIndex,
				page.summary,
				page.members,
				templates,
			)
		: "";

	return templates
		.render("hub", {
			bindingName: requireBindingName(page),
			moduleId: luaRequireModuleId(page.relFile),
			primary,
			methods: methodRows(page),
			types: typeRows(page),
			index: indexBlock ?? "",
		})
		.trimEnd();
}

function walkMdFiles(dir: string, base: string, out: string[] = []): string[] {
	if (!existsSync(dir)) return out;
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) {
			walkMdFiles(full, base, out);
		} else if (name.endsWith(".md")) {
			out.push(path.relative(base, full).replace(/\\/g, "/"));
		}
	}
	return out;
}

function cleanupOutputDir(
	outDir: string,
	writtenRelPaths: Set<string>,
): number {
	let removed = 0;
	for (const rel of walkMdFiles(outDir, outDir)) {
		if (!writtenRelPaths.has(rel)) {
			unlinkSync(path.join(outDir, rel));
			removed++;
		}
	}
	return removed;
}

export interface GenerateResult {
	manifest: Manifest;
	outDir: string;
	pageCount: number;
	fileCount: number;
	removedCount: number;
	indexJson?: string;
}

export function runGenerate(options: GenerateOptions): GenerateResult {
	const config = options.config;
	const outDir = path.resolve(options.outDir ?? config.outputDir);
	mkdirSync(outDir, { recursive: true });

	const pages = parseSourcePages(config);
	const typeIndex = buildTypeIndex(pages);
	const seeIndex = buildSeeIndex(pages);
	const summaries = pageSummaries(pages);

	const manifest: Manifest = { groups: [], symbolIndex: {} };

	let order = 1;
	for (const group of config.groups) {
		const kindSet = new Set(group.kinds);
		const items: ManifestItem[] = [];
		for (const page of pages.filter((p) => kindSet.has(p.kind))) {
			items.push({ label: page.title, slug: page.routeSlug });
		}
		if (items.length) {
			manifest.groups.push({ label: group.label, items });
		}
	}

	const writtenRelPaths = new Set<string>();
	const templates = loadTemplates(config.templatesDir);

	for (const page of pages) {
		const pageOrder = page.docs.order ?? (page.docs.index ? 0 : order++);

		let indexMarkdown: string | undefined;
		if (page.docs.index) {
			const scope = collectIndexScope(page, pages, config.inputDir);
			const scopedManifest = buildManifestForScope(page, scope, config);
			if (scopedManifest.groups.length) {
				indexMarkdown = renderApiIndex(scopedManifest, summaries, templates);
			}
		}

		const description = page.summary.trim() || page.title;

		const body = renderPageBody(page, typeIndex, templates, indexMarkdown);

		const content = renderDocument(
			templates,
			{
				title: page.title,
				description,
				route: page.routeSlug,
				kind: "hub",
				order: pageOrder,
			},
			body,
		);

		const outPath = path.join(outDir, page.outputRelPath);
		mkdirSync(path.dirname(outPath), { recursive: true });
		writeFileSync(outPath, content, "utf8");
		writtenRelPaths.add(page.outputRelPath);

		const owner = page.className ?? page.title;
		for (const m of page.members) {
			const memberSlug = memberRouteSlug(page.routeSlug, m.name);
			manifest.symbolIndex[`${page.title}:${m.name}`] = memberSlug;

			const memberRelPath = memberOutputRelPath(page.outputRelPath, m.name);
			const memberDescription = memberSummaryForPage(m);
			const memberBody = renderMember(
				m,
				typeIndex,
				seeIndex,
				{ title: page.title, href: apiHref(page.routeSlug) },
				templates,
			);

			const memberContent = renderDocument(
				templates,
				{
					title: memberDisplayLabel(owner, m),
					description: memberDescription,
					route: memberSlug,
					kind: "member",
				},
				memberBody,
			);

			const memberOutPath = path.join(outDir, memberRelPath);
			mkdirSync(path.dirname(memberOutPath), { recursive: true });
			writeFileSync(memberOutPath, memberContent, "utf8");
			writtenRelPaths.add(memberRelPath);
		}
		for (const type of page.types) {
			if (isPrimaryPageType(page, type)) {
				manifest.symbolIndex[type.name] =
					`${page.routeSlug}#${anchor(type.name)}`;
				continue;
			}

			const typeSlug = typeRouteSlug(page.routeSlug, type.name);
			manifest.symbolIndex[type.name] = typeSlug;

			const typeRelPath = typeOutputRelPath(page.outputRelPath, type.name);
			const typeBody = renderTypeLeaf(
				type,
				typeIndex,
				{ title: page.title, href: apiHref(page.routeSlug) },
				page.members,
				templates,
			);

			const typeContent = renderDocument(
				templates,
				{
					title: type.name,
					description: typeSummaryForPage(type),
					route: typeSlug,
					kind: "type",
				},
				typeBody,
			);

			const typeOutPath = path.join(outDir, typeRelPath);
			mkdirSync(path.dirname(typeOutPath), { recursive: true });
			writeFileSync(typeOutPath, typeContent, "utf8");
			writtenRelPaths.add(typeRelPath);
		}
	}

	const removedCount = cleanupOutputDir(outDir, writtenRelPaths);

	const indexJson = options.indexJson ?? config.indexJson;
	const resolvedIndex = indexJson ? path.resolve(indexJson) : undefined;
	if (resolvedIndex) {
		writeIndexJson(resolvedIndex, pages, config);
	}

	return {
		manifest,
		outDir,
		pageCount: pages.length,
		fileCount: writtenRelPaths.size,
		removedCount,
		indexJson: resolvedIndex,
	};
}
