import { apiHref, typeRouteSlug } from "./barrel-md.js";
import { linkifyTypes, linkifyTypesForTable } from "./link-types.js";
import type { ParsedMember, ParsedPage } from "./parse-source.js";
import type { ParsedType } from "./parse-types.js";
import { defaultTemplates, type Templates } from "./templates.js";
import type { TypeIndex } from "./type-index.js";
import type { FieldScope, ParsedFieldTag } from "./type-parse-utils.js";

function fieldRows(fields: ParsedFieldTag[], index: TypeIndex) {
	return fields.map((field) => ({
		name: field.name.replace(/\|/g, "\\|"),
		types: linkifyTypesForTable(field.types, index),
		desc: field.desc.replace(/\|/g, "\\|"),
	}));
}

function fieldsByScope(
	fields: ParsedFieldTag[],
	scope: FieldScope,
): ParsedFieldTag[] {
	return fields.filter((f) => f.scope === scope);
}

function documentedMemberNames(members: ParsedMember[]): Set<string> {
	return new Set(members.map((m) => m.name));
}

/** Drop `@field` entries that duplicate a documented method on the same page. */
function fieldsExceptDocumentedMembers(
	fields: ParsedFieldTag[],
	memberNames: Set<string>,
): ParsedFieldTag[] {
	if (!memberNames.size) return fields;
	return fields.filter((f) => {
		const name = f.name.replace(/\?$/, "");
		return !memberNames.has(name);
	});
}

function fieldGroups(
	type: ParsedType,
	index: TypeIndex,
	memberNames: Set<string>,
) {
	const fields = fieldsExceptDocumentedMembers(type.fields, memberNames);
	const groups: {
		title: string;
		packageNote: boolean;
		fields: ReturnType<typeof fieldRows>;
	}[] = [];
	const push = (title: string, scope: FieldScope, packageNote = false) => {
		const rows = fieldRows(fieldsByScope(fields, scope), index);
		if (rows.length) groups.push({ title, packageNote, fields: rows });
	};
	push("Fields", "public");
	push("Private fields", "private");
	push("Protected fields", "protected");
	push("Package fields", "package", true);
	return groups;
}

function typeBodyData(
	type: ParsedType,
	index: TypeIndex,
	memberNames: Set<string>,
) {
	return {
		base:
			type.kind === "class" && type.extends
				? linkifyTypes(type.extends, index)
				: "",
		definition: type.kind === "alias" ? (type.definition ?? "") : "",
		fieldGroups:
			type.kind === "class" ? fieldGroups(type, index, memberNames) : [],
	};
}

function typeBlurb(type: ParsedType): string {
	if (type.summary.trim()) return type.summary.trim();
	const first = type.description.split("\n").find((l) => l.trim());
	return first?.trim() ?? "";
}

/** Leaf page frontmatter description. */
export function typeSummaryForPage(type: ParsedType): string {
	return typeBlurb(type) || type.name;
}

export function typesExceptPrimary(
	types: ParsedType[],
	primaryClassName?: string,
): ParsedType[] {
	if (!primaryClassName) return types;
	return types.filter((t) => t.name !== primaryClassName);
}

/** Module / file export (`@class` matching `className`): on the hub, not under Types. */
export function renderPrimaryExportSection(
	type: ParsedType,
	index: TypeIndex,
	pageSummary: string,
	members: ParsedMember[] = [],
	templates: Templates = defaultTemplates(),
): string {
	const memberNames = documentedMemberNames(members);
	const visibleFields = fieldsExceptDocumentedMembers(type.fields, memberNames);
	const hasFields = visibleFields.length > 0;
	const extraDesc = type.description.trim();
	const summaryNorm = pageSummary.replace(/\s+/g, " ").trim();
	const typeSummaryNorm = type.summary.replace(/\s+/g, " ").trim();
	const showSummary =
		type.summary &&
		typeSummaryNorm !== summaryNorm &&
		!summaryNorm.startsWith(typeSummaryNorm);
	const showDescription = extraDesc.length > 0;

	if (!hasFields && !showSummary && !showDescription && type.kind !== "alias") {
		return "";
	}

	return templates
		.render("primary", {
			name: type.name,
			summary: showSummary ? type.summary : "",
			description: showDescription ? type.description : "",
			...typeBodyData(type, index, memberNames),
		})
		.trimEnd();
}

export function typeRows(
	page: ParsedPage,
): { name: string; href: string; blurb: string }[] {
	return typesExceptPrimary(page.types, page.className).map((type) => ({
		name: type.name,
		href: apiHref(typeRouteSlug(page.routeSlug, type.name)),
		blurb: typeBlurb(type).replace(/\|/g, "\\|"),
	}));
}

export function renderTypeLeaf(
	type: ParsedType,
	index: TypeIndex,
	parent: { title: string; href: string },
	members: ParsedMember[] = [],
	templates: Templates = defaultTemplates(),
): string {
	const memberNames = documentedMemberNames(members);
	return templates
		.render("type", {
			parentTitle: parent.title,
			parentHref: parent.href,
			summary: type.summary,
			description: type.description,
			...typeBodyData(type, index, memberNames),
		})
		.trimEnd();
}
