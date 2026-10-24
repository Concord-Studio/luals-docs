import assert from "node:assert/strict";
import test from "node:test";
import { memberCallVariants } from "./call-signature.js";
import type { ParsedMember } from "./parse-source.js";

function member(
	overrides: Partial<ParsedMember> & Pick<ParsedMember, "signature">,
): ParsedMember {
	return {
		name: "call",
		callSeparator: ":",
		summary: "",
		description: "",
		usageBlocks: [],
		params: [],
		returns: [],
		overloads: [],
		see: [],
		...overrides,
	};
}

test("usage assigns a different return type and skips a self return", () => {
	const created = memberCallVariants(
		member({
			signature: "function World:create()",
			returns: [{ name: "", types: "Widget", desc: "" }],
		}),
	);
	assert.equal(created[0]?.usage, "widget = world:create()");

	const chained = memberCallVariants(
		member({
			signature: "function Widget:update(value)",
			returns: [{ name: "", types: "Widget", desc: "" }],
		}),
	);
	assert.equal(chained[0]?.usage, "widget:update( value )");
});

test("usage names table results without a domain-specific variable", () => {
	const variants = memberCallVariants(
		member({
			signature: "function Store:list()",
			returns: [{ name: "", types: "table", desc: "Rows" }],
		}),
	);
	assert.equal(variants[0]?.usage, "result = store:list()");
	assert.equal(variants[0]?.returns[0]?.name, "result");
});

test("usage keeps class-like type names intact", () => {
	const variants = memberCallVariants(
		member({
			signature: "function Registry:define()",
			returns: [{ name: "", types: "WidgetClass", desc: "" }],
		}),
	);
	assert.equal(variants[0]?.usage, "widgetClass = registry:define()");
});

test("overload descriptions and optionality come from the source annotations", () => {
	const variants = memberCallVariants(
		member({
			signature: "function Store:find(query)",
			params: [
				{ name: "query", types: "string", desc: "Lookup key" },
				{ name: "out", types: "table", desc: "Table to fill" },
			],
			returns: [{ name: "", types: "table", desc: "Filled table" }],
			overloads: [
				{
					signature: "fun(self: Store, query: string, out: table): table",
					description: "",
				},
				{
					signature: "fun(self: Store, query?: string): string",
					description: "",
				},
			],
		}),
	);

	const filled = variants.find((variant) => variant.usage.includes("out"));
	assert.ok(filled);
	assert.equal(filled.params[1]?.name, "out");
	assert.equal(filled.params[1]?.types, "table");
	assert.equal(filled.params[1]?.desc, "Table to fill");
	assert.equal(filled.usage, "result = store:find( query, out )");

	const named = variants.find((variant) => variant.usage.includes("string"));
	assert.ok(named);
	assert.equal(named.params[0]?.name, "query?");
	assert.equal(named.params[0]?.types, "string?");
	assert.equal(named.params[0]?.desc, "Lookup key");
});
