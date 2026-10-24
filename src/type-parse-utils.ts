/** Shared parsing for LuaLS type strings in `@param`, `@return`, and `@field` tags. */

export function parseParamTypeAndDesc(tail: string): {
	types: string;
	desc: string;
} {
	let rest = tail.trim();
	if (rest.startsWith("fun(")) {
		let depth = 0;
		let i = 0;
		for (; i < rest.length; i++) {
			const c = rest.charAt(i);
			if (c === "(") depth++;
			else if (c === ")") {
				depth--;
				if (depth === 0) {
					i++;
					break;
				}
			}
		}
		let types = rest.slice(0, i);
		rest = rest.slice(i).trim();
		if (rest.startsWith(":")) {
			const retPart = rest.slice(1).trim();
			const { types: retTypes, desc: afterRet } =
				parseParamTypeAndDesc(retPart);
			if (retTypes) types += `: ${retTypes}`;
			return { types, desc: afterRet };
		}
		while (rest.startsWith("|")) {
			const pipe = rest.match(/^\|(\S+)/);
			if (!pipe) break;
			types += `|${pipe[1]}`;
			rest = rest.slice(pipe[0].length).trim();
		}
		return { types, desc: rest };
	}
	const m = rest.match(/^(\S+)\s+(.*)$/s);
	if (m?.[1]) return { types: m[1], desc: m[2]?.trim() ?? "" };
	return { types: rest, desc: "" };
}

const FIELD_SCOPES = new Set(["private", "protected", "public", "package"]);

export type FieldScope = "public" | "private" | "protected" | "package";

export interface ParsedFieldTag {
	name: string;
	types: string;
	desc: string;
	scope: FieldScope;
	deprecated: boolean;
}

/** Parse a line like `@field [scope] name type description`. */
export function parseFieldTag(rawTagLine: string): ParsedFieldTag | null {
	const deprecated = /@deprecated\b/i.test(rawTagLine);
	let fieldLine = rawTagLine.replace(/\s*@deprecated\b.*$/i, "").trim();
	fieldLine = fieldLine.replace(/^---\s?/, "").trim();
	if (!fieldLine.startsWith("@field")) return null;

	let rest = fieldLine.slice("@field".length).trim();
	let scope: FieldScope = "public";
	const scopeMatch = rest.match(/^(private|protected|public|package)\s+/);
	if (scopeMatch?.[1] && FIELD_SCOPES.has(scopeMatch[1])) {
		scope = scopeMatch[1] as FieldScope;
		rest = rest.slice(scopeMatch[0].length);
	}

	const nameMatch = rest.match(/^(\[\w+\]|\S+\??)\s+/);
	if (!nameMatch?.[1]) return null;
	const name = nameMatch[1];
	const { types, desc } = parseParamTypeAndDesc(
		rest.slice(nameMatch[0].length),
	);
	if (!types) return null;

	return { name, types, desc, scope, deprecated };
}

export function parseParam(rest: string): {
	name: string;
	types: string;
	desc: string;
} {
	if (rest.startsWith("...")) {
		const m = rest.match(/^\.\.\.\s*(\S+)?\s*(.*)$/);
		return {
			name: "...",
			types: m?.[1] ?? "any",
			desc: m?.[2] ?? "",
		};
	}
	const nameMatch = rest.match(/^(\w+\??)\s+/);
	if (!nameMatch)
		return { name: rest.replace(/\?$/, ""), types: "any", desc: "" };
	const name = nameMatch[1]?.replace(/\?$/, "") ?? "";
	const { types, desc } = parseParamTypeAndDesc(
		rest.slice(nameMatch[0].length),
	);
	return { name, types, desc };
}
