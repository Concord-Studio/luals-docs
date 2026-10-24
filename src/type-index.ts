import { anchor, typeRouteSlug } from "./barrel-md.js";
import type { ParsedPage, ParsedType } from "./parse-source.js";

export interface TypeIndexEntry {
	routeSlug: string;
	/** Hub heading anchor when the type is documented on the module page. */
	anchor?: string;
	relFile: string;
}

/** Exported `@class` that matches this page’s module/class export. */
export function isPrimaryPageType(page: ParsedPage, type: ParsedType): boolean {
	return (
		page.className !== undefined &&
		type.kind === "class" &&
		type.name === page.className
	);
}

export type TypeIndex = Map<string, TypeIndexEntry>;

/** Map documented type name → hub or leaf route. */
export function buildTypeIndex(pages: ParsedPage[]): TypeIndex {
	const index: TypeIndex = new Map();

	for (const page of pages) {
		for (const type of page.types) {
			const existing = index.get(type.name);
			if (existing) {
				throw new Error(
					`Duplicate documented type "${type.name}" in ${existing.relFile} and ${page.relFile}`,
				);
			}
			const onHub = isPrimaryPageType(page, type);
			index.set(type.name, {
				routeSlug: onHub
					? page.routeSlug
					: typeRouteSlug(page.routeSlug, type.name),
				anchor: onHub ? anchor(type.name) : undefined,
				relFile: page.relFile,
			});
		}
	}

	return index;
}

export function typeHref(entry: TypeIndexEntry): string {
	const base = `/${entry.routeSlug}`;
	return entry.anchor ? `${base}#${entry.anchor}` : base;
}
