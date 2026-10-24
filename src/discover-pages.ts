import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseDocsMetaFromHeaderTags } from "./docs-meta.js";
import { parseLua } from "./lua-source.js";

function isDocumentedLuaFile(absPath: string): boolean {
	const text = readFileSync(absPath, "utf8");
	const meta = parseDocsMetaFromHeaderTags(parseLua(text).headerLines);
	return meta.enabled && meta.kind !== undefined;
}

function walkLuaUnder(dir: string, workspaceRoot: string, out: string[]): void {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith("_")) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walkLuaUnder(full, workspaceRoot, out);
			continue;
		}
		if (!entry.name.endsWith(".lua")) continue;
		if (!isDocumentedLuaFile(full)) continue;
		out.push(path.relative(workspaceRoot, full).replace(/\\/g, "/"));
	}
}

/** All `.lua` files under `inputDir` with `---@docs kind` (and not `---@docs off`). */
export function discoverPagesInInputDir(
	workspaceRoot: string,
	inputDir: string,
): string[] {
	const rel = inputDir.replace(/\\/g, "/").replace(/\/+$/, "");
	const root = path.join(workspaceRoot, rel);
	if (!existsSync(root)) {
		throw new Error(`inputDir not found: ${rel} (${root})`);
	}
	const pages: string[] = [];
	walkLuaUnder(root, workspaceRoot, pages);
	pages.sort((a, b) => a.localeCompare(b));
	return pages;
}
