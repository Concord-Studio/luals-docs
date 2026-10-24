import { apiHref } from "./barrel-md.js";
import type { Manifest } from "./generate.js";
import type { ParsedPage } from "./parse-source.js";
import { defaultTemplates, type Templates } from "./templates.js";

export function renderApiIndex(
	manifest: Manifest,
	summaries: Map<string, string>,
	templates: Templates = defaultTemplates(),
): string {
	const groups = manifest.sidebar
		.filter((group) => group.items?.length)
		.map((group) => ({
			label: group.label,
			items: (group.items ?? []).map((item) => ({
				label: item.label,
				href: apiHref(item.slug),
				blurb: summaries.get(item.label) ?? "",
			})),
		}));
	if (!groups.length) return "";
	return templates.render("index", { groups }).trimEnd();
}

export function pageSummaries(pages: ParsedPage[]): Map<string, string> {
	return new Map(
		pages.map((p) => [p.title, p.summary.replace(/\s+/g, " ").trim()]),
	);
}
