import path from "node:path";
import type { ResolvedConfig } from "./config.js";
import type { Manifest, ManifestItem } from "./generate.js";
import type { ParsedPage } from "./parse-source.js";

function firstPathSegment(relativePath: string): string {
	const [head] = relativePath.split("/");
	return head ?? relativePath;
}

/** Path of `file` relative to `inputDir` (posix). */
export function relToInputDir(relFile: string, inputDir: string): string {
	const norm = relFile.replace(/\\/g, "/");
	const prefix = `${inputDir.replace(/\\/g, "/").replace(/\/+$/, "")}/`;
	if (norm.startsWith(prefix)) {
		return norm.slice(prefix.length);
	}
	return norm;
}

/** Directory containing the file, relative to `inputDir` (`""` = root of input tree). */
export function folderOfRelToInput(relToInput: string): string {
	const dir = path.posix.dirname(relToInput);
	return dir === "." ? "" : dir;
}

export function pageFolder(page: ParsedPage, inputDir: string): string {
	return folderOfRelToInput(relToInputDir(page.relFile, inputDir));
}

function indexByFolder(
	pages: ParsedPage[],
	inputDir: string,
): Map<string, ParsedPage> {
	const map = new Map<string, ParsedPage>();
	for (const p of pages) {
		if (!p.docs.index) continue;
		const folder = pageFolder(p, inputDir);
		map.set(folder, p);
	}
	return map;
}

export function assertOneIndexPerFolder(
	pages: ParsedPage[],
	inputDir: string,
): void {
	const seen = new Map<string, string>();
	for (const p of pages) {
		if (!p.docs.index) continue;
		const folder = pageFolder(p, inputDir);
		const prev = seen.get(folder);
		if (prev) {
			throw new Error(
				`Only one ---@docs index allowed per folder (${folder || "input root"}): ${prev} and ${p.relFile}`,
			);
		}
		seen.set(folder, p.relFile);
	}
}

/** Immediate child directory names under `folder` that contain documented pages. */
function immediateSubdirs(
	folder: string,
	pages: ParsedPage[],
	inputDir: string,
): string[] {
	const subs = new Set<string>();
	for (const p of pages) {
		const f = pageFolder(p, inputDir);
		if (folder === "") {
			if (!f) continue;
			subs.add(f.includes("/") ? firstPathSegment(f) : f);
			continue;
		}
		if (f === folder) continue;
		if (!f.startsWith(`${folder}/`)) continue;
		const rest = f.slice(folder.length + 1);
		subs.add(`${folder}/${firstPathSegment(rest)}`);
	}
	return [...subs].sort((a, b) => a.localeCompare(b));
}

/**
 * Pages listed on this index: same-folder siblings, plus each immediate subfolder
 * as either a nested index barrel or all pages under that subfolder.
 */
export function collectIndexScope(
	indexPage: ParsedPage,
	allPages: ParsedPage[],
	inputDir: string,
): ParsedPage[] {
	const indexFolder = pageFolder(indexPage, inputDir);
	const barrels = indexByFolder(allPages, inputDir);
	const result: ParsedPage[] = [];
	const seen = new Set<string>();

	const add = (p: ParsedPage) => {
		if (p.relFile === indexPage.relFile) return;
		if (seen.has(p.relFile)) return;
		seen.add(p.relFile);
		result.push(p);
	};

	for (const p of allPages) {
		if (pageFolder(p, inputDir) !== indexFolder) continue;
		if (p.docs.index) continue;
		add(p);
	}

	for (const sub of immediateSubdirs(indexFolder, allPages, inputDir)) {
		const nested = barrels.get(sub);
		if (nested) {
			add(nested);
			continue;
		}
		for (const p of allPages) {
			const f = pageFolder(p, inputDir);
			if (f === sub || f.startsWith(`${sub}/`)) {
				if (p.docs.index) continue;
				add(p);
			}
		}
	}

	return result;
}

export function buildManifestForScope(
	indexPage: ParsedPage,
	scope: ParsedPage[],
	config: ResolvedConfig,
): Manifest {
	const manifest: Manifest = { groups: [], symbolIndex: {} };

	for (const group of config.groups) {
		const kindSet = new Set(group.kinds);
		const items: ManifestItem[] = [];
		for (const page of scope) {
			if (page.relFile === indexPage.relFile) continue;
			if (!kindSet.has(page.kind)) continue;
			items.push({ label: page.title, slug: page.routeSlug });
		}
		if (items.length) {
			manifest.groups.push({ label: group.label, items });
		}
	}

	return manifest;
}
