import { apiHref, memberDisplayLabel, memberRouteSlug } from "./barrel-md.js";
import { type CallVariant, memberCallVariants } from "./call-signature.js";
import { linkifyTypesForTable } from "./link-types.js";
import type { ParsedMember, ParsedPage } from "./parse-source.js";
import { type SeeIndex, seeEntries } from "./see-index.js";
import { defaultTemplates, type Templates } from "./templates.js";
import type { TypeIndex } from "./type-index.js";

interface TableRow {
	name: string;
	types: string;
	desc: string;
}

function tableRows(
	rows: { name: string; types: string; desc: string }[],
	index: TypeIndex,
): TableRow[] {
	return rows.map((row) => ({
		name: row.name,
		types: linkifyTypesForTable(row.types, index),
		desc: row.desc.replace(/\|/g, "\\|"),
	}));
}

function memberBlurb(m: ParsedMember): string {
	if (m.summary.trim()) return m.summary.trim();
	const first = m.description.split("\n").find((l) => l.trim());
	return first?.trim() ?? "";
}

/** Leaf page frontmatter description (summary or first description line). */
export function memberSummaryForPage(m: ParsedMember): string {
	return memberBlurb(m) || m.name;
}

export function methodRows(
	page: ParsedPage,
): { label: string; href: string; blurb: string }[] {
	const owner = page.className ?? page.title;
	return page.members.map((member) => ({
		label: memberDisplayLabel(owner, member),
		href: apiHref(memberRouteSlug(page.routeSlug, member.name)),
		blurb: memberBlurb(member).replace(/\|/g, "\\|"),
	}));
}

function variantView(variant: CallVariant, index: TypeIndex, multi: boolean) {
	const heading = multi ? "####" : "###";
	return {
		usage: variant.usage,
		description: variant.description ?? "",
		argumentHeading: `${heading} Arguments`,
		arguments: tableRows(variant.params, index),
		returnHeading: `${heading} Returns`,
		returns: tableRows(variant.returns, index),
	};
}

export function renderMember(
	member: ParsedMember,
	index: TypeIndex,
	seeIndex: SeeIndex,
	parent: { title: string; href: string },
	templates: Templates = defaultTemplates(),
): string {
	const variants = memberCallVariants(member);
	const multi = variants.length > 1;
	const prose =
		multi && (member.summary || member.description)
			? [member.summary, member.description].filter(Boolean).join("\n\n")
			: "";

	return templates
		.render("member", {
			parentTitle: parent.title,
			parentHref: parent.href,
			multi,
			summary: multi ? "" : member.summary,
			description: multi ? "" : member.description,
			variants: variants.map((variant, i) => ({
				...variantView(variant, index, multi),
				separator: i > 0,
				multi,
				prose: i === 0 ? prose : "",
			})),
			usageBlocks: (member.usageBlocks ?? []).map((block) => block.trimEnd()),
			see: seeEntries(member.see, seeIndex, index),
		})
		.trimEnd();
}
