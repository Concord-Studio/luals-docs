import { apiHref, memberDisplayLabel, memberRouteSlug } from "./barrel-md.js";
import type { ParsedPage } from "./parse-source.js";
import { defaultTemplates, type Templates } from "./templates.js";
import { type TypeIndex, typeHref } from "./type-index.js";

export interface SeeIndexEntry {
	href: string;
	/** e.g. `World:emit` or `Utils.shallowCopy` */
	label: string;
}

/** Canonical `@see` key: `Owner#memberName`. */
export type SeeIndex = Map<string, SeeIndexEntry>;

export function buildSeeIndex(pages: ParsedPage[]): SeeIndex {
	const index: SeeIndex = new Map();
	for (const page of pages) {
		const owner = page.className ?? page.title;
		for (const member of page.members) {
			const key = `${owner}#${member.name}`;
			index.set(key, {
				href: apiHref(memberRouteSlug(page.routeSlug, member.name)),
				label: memberDisplayLabel(owner, member),
			});
		}
	}
	return index;
}

/** `World` or `Concord.World`, then a final `:`, `.`, or `#` and a member. */
const SEE_REF = /^([A-Za-z_][\w]*(?:\.[A-Za-z_]\w*)*)([:.#])([A-Za-z_]\w*)$/;

/** `World` or `Concord.System`. */
const TYPE_REF = /^([A-Za-z_][\w]*(?:\.[A-Za-z_]\w*)*)$/;

/** Normalize `World:emit`, `World.emit`, or `World#emit` to `World#emit`. */
export function canonicalSeeKey(ref: string): string | null {
	const m = ref.trim().match(SEE_REF);
	if (!m?.[1] || !m[3]) return null;
	return `${m[1]}#${m[3]}`;
}

export function seeDisplayLabel(ref: string, seeIndex: SeeIndex): string {
	const key = canonicalSeeKey(ref);
	if (key) {
		const entry = seeIndex.get(key);
		if (entry) return entry.label;
	}
	const m = ref.trim().match(SEE_REF);
	if (m?.[1] && m[3]) return `${m[1]}${m[2] === "#" ? ":" : m[2]}${m[3]}`;
	return ref.replace(/#/g, ":");
}

export function resolveSeeHref(
	ref: string,
	seeIndex: SeeIndex,
	typeIndex: TypeIndex,
): string | null {
	const trimmed = ref.trim();
	const key = canonicalSeeKey(trimmed);
	if (key) {
		const entry = seeIndex.get(key);
		if (entry) return entry.href;
	}

	const typeMatch = trimmed.match(TYPE_REF);
	if (typeMatch?.[1]) {
		const entry = typeIndex.get(typeMatch[1]);
		if (entry) {
			return typeHref(entry);
		}
	}

	return null;
}

export function seeEntries(
	refs: string[],
	seeIndex: SeeIndex,
	typeIndex: TypeIndex,
): { label: string; href: string }[] {
	const unique = [...new Set(refs.map((r) => r.trim()).filter(Boolean))];
	return unique.map((ref) => ({
		label: seeDisplayLabel(ref, seeIndex),
		href: resolveSeeHref(ref, seeIndex, typeIndex) ?? "",
	}));
}

export function renderSeeAlsoSection(
	refs: string[],
	seeIndex: SeeIndex,
	typeIndex: TypeIndex,
	templates: Templates = defaultTemplates(),
): string {
	const see = seeEntries(refs, seeIndex, typeIndex);
	if (!see.length) return "";
	return templates.render("see", { see }).trimEnd();
}
