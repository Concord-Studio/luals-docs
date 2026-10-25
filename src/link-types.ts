import type { TypeIndex } from "./type-index.js";
import { typeHref } from "./type-index.js";

const PRIMITIVE_TYPES = new Set([
	"any",
	"boolean",
	"integer",
	"nil",
	"number",
	"string",
	"table",
	"...",
]);

function isIdentStart(c: string): boolean {
	return /[A-Za-z_]/.test(c);
}

function isIdentPart(c: string): boolean {
	return /[\w]/.test(c);
}

/** `Entity` or `Concord.Entity`, stopping before a trailing `.` that is not an identifier. */
function readQualifiedName(
	segment: string,
	start: number,
): { name: string; end: number } {
	let j = start + 1;
	while (j < segment.length && isIdentPart(segment.charAt(j))) j++;
	while (segment.charAt(j) === "." && isIdentStart(segment.charAt(j + 1))) {
		j++;
		while (j < segment.length && isIdentPart(segment.charAt(j))) j++;
	}
	return { name: segment.slice(start, j), end: j };
}

/** Replace known type names in a type string with Markdown links. */
export function linkifyTypes(typeStr: string, index: TypeIndex): string {
	return rewriteTypeSegment(typeStr, index);
}

function rewriteTypeSegment(segment: string, index: TypeIndex): string {
	let out = "";
	let i = 0;

	while (i < segment.length) {
		const c = segment.charAt(i);

		if (c === "f" && segment.slice(i).startsWith("fun(")) {
			const end = findMatchingParen(segment, i + 3);
			if (end >= 0) {
				const funPart = segment.slice(i, end + 1);
				const after = segment.slice(end + 1);
				const retMatch = after.match(/^(\s*:\s*)([\s\S]*)/);
				if (retMatch) {
					out += rewriteFunParams(funPart, index);
					out += retMatch[1] ?? "";
					out += rewriteTypeSegment(retMatch[2] ?? "", index);
					i = segment.length;
					break;
				}
				out += rewriteFunParams(funPart, index);
				i = end + 1;
				continue;
			}
		}

		if (isIdentStart(c)) {
			const { name, end } = readQualifiedName(segment, i);
			const linked = linkTypeName(name, index);
			out += linked ?? name;
			i = end;
			continue;
		}

		out += c;
		i++;
	}

	return out;
}

function rewriteFunParams(funPart: string, index: TypeIndex): string {
	const open = funPart.indexOf("(");
	const close = funPart.lastIndexOf(")");
	if (open < 0 || close <= open) return funPart;
	const head = funPart.slice(0, open + 1);
	const params = funPart.slice(open + 1, close);
	const tail = funPart.slice(close);
	const linkedParams = params
		.split(",")
		.map((p) => {
			const colon = p.indexOf(":");
			if (colon < 0) return p.trim();
			const before = p.slice(0, colon + 1);
			const typePart = p.slice(colon + 1).trim();
			return `${before} ${rewriteTypeSegment(typePart, index)}`;
		})
		.join(", ");
	return head + linkedParams + tail;
}

function findMatchingParen(s: string, openIndex: number): number {
	let depth = 0;
	for (let i = openIndex; i < s.length; i++) {
		const c = s.charAt(i);
		if (c === "(") depth++;
		else if (c === ")") {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

function linkTypeName(name: string, index: TypeIndex): string | null {
	if (PRIMITIVE_TYPES.has(name.toLowerCase())) return null;
	const entry = index.get(name);
	if (!entry) return null;
	return `[${name}](${typeHref(entry)})`;
}

/** Escape pipe characters for Markdown table cells after linkification. */
export function linkifyTypesForTable(
	typeStr: string,
	index: TypeIndex,
): string {
	return linkifyTypes(typeStr, index).replace(/\|/g, "\\|");
}
