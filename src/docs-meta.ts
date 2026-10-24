export interface PageDocsMeta {
	enabled: boolean;
	kind?: string;
	slug?: string;
	index: boolean;
	order?: number;
	title?: string;
}

function parseTagLine(tag: string): { kind: string; rest: string } {
	const m = tag.match(/^@(\w+)\s*(.*)$/);
	return { kind: m?.[1] ?? "", rest: m?.[2]?.trim() ?? "" };
}

/** Parse `---@docs …` tags from file-header comment lines (without `---` prefix). */
export function parseDocsMetaFromHeaderTags(
	headerTagLines: string[],
): PageDocsMeta {
	const meta: PageDocsMeta = {
		enabled: true,
		index: false,
	};

	for (const raw of headerTagLines) {
		const t = raw.replace(/^---\s?/, "").trim();
		if (!t.startsWith("@docs")) continue;

		const rest = t.slice("@docs".length).trim();
		if (!rest || rest === "off") {
			meta.enabled = false;
			continue;
		}
		if (rest === "index") {
			meta.index = true;
			continue;
		}

		const space = rest.indexOf(" ");
		const key = space < 0 ? rest : rest.slice(0, space);
		const value = space < 0 ? "" : rest.slice(space + 1).trim();

		switch (key) {
			case "kind": {
				const kind = value.split(/\s+/)[0];
				if (kind) meta.kind = kind;
				break;
			}
			case "slug":
				if (value) meta.slug = value.replace(/^\/+|\/+$/g, "");
				break;
			case "order": {
				const n = Number.parseInt(value, 10);
				if (!Number.isNaN(n)) meta.order = n;
				break;
			}
			case "title":
				if (value) meta.title = value;
				break;
			default:
				break;
		}
	}

	return meta;
}

/** All `---` lines in the leading preamble (blank lines between comment blocks allowed). */
export function collectPreambleCommentLines(lines: string[]): string[] {
	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined || line.trim() === "") continue;
		if (line.startsWith("---")) {
			out.push(line);
			continue;
		}
		break;
	}
	return out;
}

/** Index of the first non-empty line that is not a `---` comment (start of code). */
export function preambleEndIndex(lines: string[]): number {
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined || line.trim() === "") continue;
		if (line.startsWith("---")) continue;
		return i;
	}
	return lines.length;
}

export function collectHeaderTagLines(lines: string[]): {
	tagLines: string[];
	endIndex: number;
	className?: string;
} {
	const tagLines = collectPreambleCommentLines(lines);
	const endIndex = preambleEndIndex(lines);

	let className: string | undefined;
	let seenDocsKind = false;
	for (const line of tagLines) {
		const t = line.replace(/^---\s?/, "");
		const { kind, rest } = parseTagLine(t);
		if (kind === "docs") {
			const key = rest.split(/\s+/)[0];
			if (key === "kind") seenDocsKind = true;
		}
		if (kind === "class" && seenDocsKind && !className) {
			const m = rest.match(/^(\S+)/);
			if (m) className = m[1]?.replace(/:.+$/, "");
		}
	}

	return { tagLines, endIndex, className };
}

/** Index at the root of `inputDir` defaults to slug `{routePrefix}`. */
export function applyIndexSlugDefault(
	relFile: string,
	inputDir: string,
	routePrefix: string,
	meta: PageDocsMeta,
): PageDocsMeta {
	if (!meta.index || meta.slug) return meta;
	const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
	const rel = norm(relFile);
	const root = norm(inputDir);
	const isInputRootIndex = rel === `${root}/init.lua` && meta.index;
	if (!isInputRootIndex) return meta;
	return { ...meta, slug: routePrefix };
}

export function titleFromBasename(relFile: string): string {
	const base = relFile.replace(/\\/g, "/").split("/").pop() ?? relFile;
	const stem = base.replace(/\.lua$/i, "");
	if (stem === "init") {
		const parts = relFile.replace(/\\/g, "/").split("/");
		if (parts.length >= 2) {
			const parent = parts[parts.length - 2];
			if (parent !== undefined) {
				return parent.charAt(0).toUpperCase() + parent.slice(1);
			}
		}
	}
	return stem.charAt(0).toUpperCase() + stem.slice(1);
}
