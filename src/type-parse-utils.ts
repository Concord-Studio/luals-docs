/** Shared parsing for LuaLS type strings in `@param`, `@return`, and `@field` tags. */

/**
 * Remove a configured `Namespace.` prefix from a type name or type string.
 * `Concord` itself is unchanged. Identifiers that merely end in that word are left alone.
 */
export function stripNamespacePrefix(
	text: string,
	namespace: string | undefined,
): string {
	if (!namespace || !text.includes(`${namespace}.`)) return text;
	return text.replace(new RegExp(`(?<![\\w])${namespace}\\.`, "g"), "");
}

/**
 * Split a LuaLS type from the description that follows it.
 * Spaces inside `()`, `<>`, `{}`, and `[]` stay in the type, as do `|` unions.
 */
export function splitTypeAndDescription(input: string): {
	types: string;
	desc: string;
} {
	const source = input.trim();
	let depth = 0;
	let i = 0;
	while (i < source.length) {
		const c = source.charAt(i);
		if (c === "<" || c === "(" || c === "{" || c === "[") {
			depth++;
			i++;
			continue;
		}
		if (c === ">" || c === ")" || c === "}" || c === "]") {
			if (depth > 0) depth--;
			i++;
			continue;
		}
		if (depth === 0 && /\s/.test(c)) {
			let j = i + 1;
			while (j < source.length && /\s/.test(source.charAt(j))) j++;
			const soFar = source.slice(0, i).trimEnd();
			if (
				source.charAt(j) === "|" ||
				soFar.endsWith("|") ||
				soFar.endsWith(":")
			) {
				i = j;
				continue;
			}
			break;
		}
		i++;
	}
	return {
		types: source.slice(0, i).trim(),
		desc: source.slice(i).trim(),
	};
}

export function parseParamTypeAndDesc(tail: string): {
	types: string;
	desc: string;
} {
	return splitTypeAndDescription(tail);
}

/**
 * LuaLS `---@return <type> [name] [description]`.
 * A lowercase identifier is the name. `#` forces a description and no name.
 */
export function parseReturnTag(rest: string): {
	types: string;
	name: string;
	desc: string;
} {
	const { types, desc: afterType } = splitTypeAndDescription(rest);
	if (afterType.startsWith("#")) {
		return { types, name: "", desc: afterType.replace(/^#\s?/, "") };
	}
	const nameMatch = afterType.match(/^([a-z_][\w]*)(?:\s+([\s\S]*))?$/);
	if (nameMatch?.[1]) {
		return {
			types,
			name: nameMatch[1],
			desc: nameMatch[2]?.trim() ?? "",
		};
	}
	return { types, name: "", desc: afterType };
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
		const after = rest.slice(3).trim();
		if (!after) return { name: "...", types: "any", desc: "" };
		const { types, desc } = splitTypeAndDescription(after);
		return { name: "...", types: types || "any", desc };
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
