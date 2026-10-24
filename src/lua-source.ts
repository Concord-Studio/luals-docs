import { fileURLToPath } from "node:url";
import { Language, type Node, Parser } from "web-tree-sitter";

/**
 * Lua grammar Wasm in `vendor/tree-sitter-lua.wasm`.
 * `pnpm update-grammar` replaces it with a tree-sitter-lua release
 * and installs a compatible web-tree-sitter when the current one cannot load it.
 * The checked-in release is `vendor/tree-sitter-lua.json`.
 */
const wasmPath = fileURLToPath(
	new URL("../vendor/tree-sitter-lua.wasm", import.meta.url),
);

await Parser.init();
const Lua = await Language.load(wasmPath);
const parser = new Parser();
parser.setLanguage(Lua);

export type CallSeparator = ":" | ".";

export interface LuaFunction {
	name: string;
	callSeparator: CallSeparator;
	signature: string;
	/** Contiguous `---` comments directly above the function. */
	docLines: string[];
	/** `--[===[@usage]===]` blocks between those comments and the function. */
	blockUsages: string[];
}

export interface LuaFile {
	/** Leading `---` comments before the first statement. */
	headerLines: string[];
	functions: LuaFunction[];
}

export function parseLua(source: string): LuaFile {
	const tree = parser.parse(source);
	if (!tree) return { headerLines: [], functions: [] };
	const root = tree.rootNode;
	return {
		headerLines: headerLines(root),
		functions: functionsIn(root),
	};
}

function headerLines(root: Node): string[] {
	const lines: string[] = [];
	for (const child of root.namedChildren) {
		if (!isDocComment(child)) break;
		lines.push(child.text);
	}
	return lines;
}

function functionsIn(root: Node): LuaFunction[] {
	const functions: LuaFunction[] = [];
	for (const node of root.descendantsOfType("function_declaration")) {
		const fn = documentedFunction(node);
		if (fn) functions.push(fn);
	}
	return functions;
}

function documentedFunction(node: Node): LuaFunction | null {
	const name = node.childForFieldName("name");
	if (!name) return null;

	let callSeparator: CallSeparator;
	let owner: string;
	let method: string;
	if (name.type === "method_index_expression") {
		callSeparator = ":";
		const table = name.childForFieldName("table");
		const member = name.childForFieldName("method");
		if (table?.type !== "identifier" || !member) return null;
		owner = table.text;
		method = member.text;
	} else if (name.type === "dot_index_expression") {
		callSeparator = ".";
		const table = name.childForFieldName("table");
		const field = name.childForFieldName("field");
		if (table?.type !== "identifier" || !field) return null;
		owner = table.text;
		method = field.text;
	} else {
		return null;
	}

	const params = (node.childForFieldName("parameters")?.text ?? "()").replace(
		/\s+/g,
		" ",
	);
	const { docLines, blockUsages } = docsAbove(node);
	return {
		name: method,
		callSeparator,
		signature: `function ${owner}${callSeparator}${method}${params}`,
		docLines,
		blockUsages,
	};
}

/** Comment nodes that sit between this function and the previous statement. */
function precedingComments(node: Node): Node[] {
	const parent = node.parent;
	if (!parent) return [];
	const prior: Node[] = [];
	for (const child of parent.namedChildren) {
		if (child.startIndex === node.startIndex) break;
		prior.push(child);
	}
	const comments: Node[] = [];
	for (let i = prior.length - 1; i >= 0; i--) {
		const child = prior[i];
		if (!child || child.type !== "comment") break;
		comments.unshift(child);
	}
	return comments;
}

function docsAbove(fn: Node): { docLines: string[]; blockUsages: string[] } {
	const comments = precedingComments(fn);
	const blockUsages: string[] = [];
	let i = comments.length - 1;
	while (i >= 0) {
		const body = blockUsageBody(comments[i]);
		if (body === null) break;
		blockUsages.unshift(body);
		i--;
	}

	const docLines: string[] = [];
	let nextRow =
		i + 1 < comments.length
			? comments[i + 1]?.startPosition.row
			: fn.startPosition.row;
	if (nextRow === undefined) nextRow = fn.startPosition.row;
	while (i >= 0) {
		const comment = comments[i];
		if (!comment || !isDocComment(comment)) break;
		if (docLines.length > 0 && comment.endPosition.row + 1 !== nextRow) break;
		docLines.unshift(comment.text);
		nextRow = comment.startPosition.row;
		i--;
	}
	return { docLines, blockUsages };
}

function isDocComment(node: Node | undefined): node is Node {
	return node?.type === "comment" && node.text.startsWith("---");
}

/** Body of a long comment whose text starts with `@usage`. Any bracket level. */
function blockUsageBody(node: Node | undefined): string | null {
	if (!node || node.type !== "comment" || !node.text.startsWith("--[")) {
		return null;
	}
	const content = node.childForFieldName("content")?.text ?? "";
	if (!content.startsWith("@usage")) return null;
	const body = content.replace(/^@usage[ \t]?/, "").trim();
	return body || null;
}
