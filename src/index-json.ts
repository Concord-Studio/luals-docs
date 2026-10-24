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

export interface IndexLink {
	title: string;
	route: string;
}

export interface IndexGroup {
	label: string;
	items: IndexLink[];
}

export type IndexEntry = IndexLink | IndexGroup;

export type IndexJson = IndexEntry[];

function orderForPages(pages: ParsedPage[]): Map<string, number> {
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

function link(page: ParsedPage): IndexLink {
	return { title: page.title, route: page.routeSlug };
}

/** Narrowest config group whose kinds cover every page in a nested index. */
function groupIndexForScope(
	scope: ParsedPage[],
	config: ResolvedConfig,
): number | undefined {
	if (!scope.length) return undefined;

	const scopedKinds = new Set(scope.map((p) => p.kind));
	let match: number | undefined;
	let narrowest = Number.POSITIVE_INFINITY;

	for (const [i, group] of config.groups.entries()) {
		const groupKinds = new Set(group.kinds);
		if (![...scopedKinds].every((k) => groupKinds.has(k))) continue;
		if (group.kinds.length < narrowest) {
			narrowest = group.kinds.length;
			match = i;
		}
	}

	return match;
}

function nestedIndexEntry(
	indexPage: ParsedPage,
	pages: ParsedPage[],
	config: ResolvedConfig,
	orders: Map<string, number>,
): { groupIndex: number | undefined; entry: IndexGroup } {
	const scope = collectIndexScope(indexPage, pages, config.inputDir);
	const groupIndex = groupIndexForScope(scope, config);
	const groupPages = sortPages([indexPage, ...scope], orders);
	return {
		groupIndex,
		entry: {
			label:
				groupIndex === undefined
					? indexPage.title
					: (config.groups[groupIndex]?.label ?? indexPage.title),
			items: groupPages.map(link),
		},
	};
}

/**
 * Index fragment: root `@docs index` links, then config groups in array order.
 * A nested `@docs index` is emitted with the group its pages belong to.
 * Index pages are not repeated inside kind groups.
 */
export function buildIndexJson(
	pages: ParsedPage[],
	config: ResolvedConfig,
): IndexJson {
	const orders = orderForPages(pages);
	const result: IndexJson = [];

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
		result.push(link(p));
	}

	const nestedByGroup = new Map<number, IndexGroup[]>();
	for (const indexPage of nestedIndexes) {
		const { groupIndex, entry } = nestedIndexEntry(
			indexPage,
			pages,
			config,
			orders,
		);
		if (groupIndex === undefined) {
			result.push(entry);
			continue;
		}
		const list = nestedByGroup.get(groupIndex) ?? [];
		list.push(entry);
		nestedByGroup.set(groupIndex, list);
	}

	for (const [i, group] of config.groups.entries()) {
		for (const entry of nestedByGroup.get(i) ?? []) {
			result.push(entry);
		}

		const kindSet = new Set(group.kinds);
		const items = sortPages(
			pages.filter(
				(p) =>
					kindSet.has(p.kind) &&
					!p.docs.index &&
					!isUnderNestedFolderBarrel(p, indexFolders, config.inputDir),
			),
			orders,
		).map(link);

		if (items.length) {
			result.push({ label: group.label, items });
		}
	}

	return result;
}

export function writeIndexJson(
	indexJsonPath: string,
	pages: ParsedPage[],
	config: ResolvedConfig,
): void {
	const abs = path.resolve(indexJsonPath);
	mkdirSync(path.dirname(abs), { recursive: true });
	const index = buildIndexJson(pages, config);
	writeFileSync(abs, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}
