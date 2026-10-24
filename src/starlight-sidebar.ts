import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ResolvedConfig } from "./config.js";
import { collectIndexScope, pageFolder } from "./index-scope.js";
import type { ParsedPage } from "./parse-source.js";

/** Pages in a subfolder with its own `@docs index` are linked from that barrel only. */
function isUnderNestedFolderBarrel(
	page: ParsedPage,
	indexFolders: Set<string>,
	inputDir: string,
): boolean {
	const folder = pageFolder(page, inputDir);
	if (!folder) return false;
	return indexFolders.has(folder);
}

/** Starlight internal link: https://starlight.astro.build/guides/sidebar/ */
export interface StarlightSidebarLink {
	slug: string;
}

/** Starlight sidebar group with `label` + `items`. */
export interface StarlightSidebarGroup {
	label: string;
	items: StarlightSidebarLink[];
}

/** Top-level slug links and/or groups (valid `starlight.sidebar` entries). */
export type StarlightSidebarEntry =
	| StarlightSidebarLink
	| StarlightSidebarGroup;

export type StarlightSidebarExport = StarlightSidebarEntry[];

function starlightOrderForPages(pages: ParsedPage[]): Map<string, number> {
	let order = 1;
	const map = new Map<string, number>();
	for (const page of pages) {
		map.set(page.relFile, page.docs.order ?? (page.docs.index ? 0 : order++));
	}
	return map;
}

function sortPages(
	pages: ParsedPage[],
	orders: Map<string, number>,
): ParsedPage[] {
	return [...pages].sort((a, b) => {
		const diff = (orders.get(a.relFile) ?? 0) - (orders.get(b.relFile) ?? 0);
		if (diff !== 0) return diff;
		return a.title.localeCompare(b.title);
	});
}

/** Label for a nested `@docs index` group from config `sidebar`, not `@docs title`. */
function nestedIndexSidebarLabel(
	scope: ParsedPage[],
	config: ResolvedConfig,
	fallback: string,
): string {
	if (!scope.length) return fallback;

	const scopedKinds = new Set(scope.map((p) => p.kind));
	let label: string | undefined;
	let narrowest = Number.POSITIVE_INFINITY;

	for (const group of config.sidebar) {
		const groupKinds = new Set(group.kinds);
		if (![...scopedKinds].every((k) => groupKinds.has(k))) continue;
		if (group.kinds.length < narrowest) {
			narrowest = group.kinds.length;
			label = group.label;
		}
	}

	return label ?? fallback;
}

/**
 * Starlight sidebar fragment: root entry barrel(s), then configured kind groups
 * (objects, submodules, etc.) without index/barrel pages mixed into groups.
 */
export function buildStarlightSidebar(
	pages: ParsedPage[],
	config: ResolvedConfig,
): StarlightSidebarExport {
	const orders = starlightOrderForPages(pages);
	const result: StarlightSidebarExport = [];

	const indexFolders = new Set<string>();
	for (const p of pages) {
		if (p.docs.index) {
			indexFolders.add(pageFolder(p, config.inputDir));
		}
	}

	const indexPages = sortPages(
		pages.filter((p) => p.docs.index),
		orders,
	);

	const rootIndexes = indexPages.filter(
		(p) => pageFolder(p, config.inputDir) === "",
	);
	const nestedIndexes = indexPages.filter(
		(p) => pageFolder(p, config.inputDir) !== "",
	);

	for (const p of rootIndexes) {
		result.push({ slug: p.routeSlug });
	}

	for (const indexPage of nestedIndexes) {
		const scope = collectIndexScope(indexPage, pages, config.inputDir);
		const groupPages = sortPages([indexPage, ...scope], orders);
		result.push({
			label: nestedIndexSidebarLabel(scope, config, indexPage.title),
			items: groupPages.map((p) => ({ slug: p.routeSlug })),
		});
	}

	for (const group of config.sidebar) {
		const kindSet = new Set(group.kinds);
		const items = sortPages(
			pages.filter(
				(p) =>
					kindSet.has(p.kind) &&
					!p.docs.index &&
					!isUnderNestedFolderBarrel(p, indexFolders, config.inputDir),
			),
			orders,
		).map((p) => ({ slug: p.routeSlug }));

		if (items.length) {
			result.push({ label: group.label, items });
		}
	}

	return result;
}

export function writeStarlightSidebarJson(
	sidebarPath: string,
	pages: ParsedPage[],
	config: ResolvedConfig,
): void {
	const abs = path.resolve(sidebarPath);
	mkdirSync(path.dirname(abs), { recursive: true });
	const sidebar = buildStarlightSidebar(pages, config);
	writeFileSync(abs, `${JSON.stringify(sidebar, null, 2)}\n`, "utf8");
}
