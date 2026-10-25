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

test("usage assigns a different return type and a self return", () => {
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
	assert.equal(chained[0]?.usage, "widget = widget:update( value )");
	assert.equal(chained[0]?.returns[0]?.name, "widget");
});

test("usage uses the last segment of a dotted return type", () => {
	const created = memberCallVariants(
		member({
			signature: "function Component.new(name)",
			returns: [{ name: "", types: "Concord.ComponentClass", desc: "" }],
		}),
	);
	assert.equal(created[0]?.usage, "componentClass = Component.new( name )");

	const named = memberCallVariants(
		member({
			signature: "function Component.new(name)",
			returns: [{ name: "component", types: "ComponentClass", desc: "" }],
		}),
	);
	assert.equal(named[0]?.usage, "component = Component.new( name )");
	assert.equal(named[0]?.returns[0]?.name, "component");
	assert.equal(named[0]?.returns[0]?.types, "ComponentClass");

	const chained = memberCallVariants(
		member({
			signature: "function Entity:give(name)",
			returns: [{ name: "", types: "Concord.Entity", desc: "" }],
		}),
	);
	assert.equal(chained[0]?.usage, "entity = entity:give( name )");

	const constructed = memberCallVariants(
		member({
			signature: "function Entity.new()",
			returns: [{ name: "", types: "Concord.Entity", desc: "" }],
		}),
	);
	assert.equal(constructed[0]?.usage, "entity = Entity.new()");
});

test("a documented any return stays in the returns table", () => {
	const variants = memberCallVariants(
		member({
			signature: "function World:getResource(name)",
			params: [{ name: "name", types: "string", desc: "Name of the resource" }],
			returns: [
				{
					name: "resource",
					types: "any",
					desc: "The resource, or nil if none was set",
				},
			],
		}),
	);
	assert.equal(variants[0]?.usage, "resource = world:getResource( name )");
	assert.equal(variants[0]?.returns[0]?.name, "resource");
	assert.equal(variants[0]?.returns[0]?.types, "any");
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

test("a documented return name is used for an overload", () => {
	const variants = memberCallVariants(
		member({
			signature: "function System.new(name, definition)",
			returns: [{ name: "system", types: "SystemClass", desc: "" }],
			overloads: [
				{
					signature:
						"fun(definition: table<string, FilterDefinition>): SystemClass",
					description: "",
				},
			],
		}),
	);
	assert.equal(variants[0]?.usage, "system = System.new( name, definition )");
	const overload = variants.find(
		(variant) => variant.usage === "system = System.new( definition )",
	);
	assert.ok(overload);
	assert.equal(overload.returns[0]?.name, "system");
	assert.equal(overload.returns[0]?.types, "SystemClass");
	assert.equal(overload.params[0]?.types, "table<string, FilterDefinition>");
});

test("a union return name is not assigned on a nil overload", () => {
	const variants = memberCallVariants(
		member({
			signature: "function World:query(def, onMatch)",
			returns: [
				{
					name: "matches",
					types: "table|nil",
					desc: "The list of matches, or nil if onMatch was a callback",
				},
			],
			overloads: [
				{
					signature:
						"fun(self: World, def: FilterDefinition, onMatch: fun(e: Entity)): nil",
					description: "Pass a function as onMatch.",
				},
				{
					signature:
						"fun(self: World, def: FilterDefinition, onMatch?: table): table",
					description: "Collect matches into a table.",
				},
			],
		}),
	);
	assert.equal(
		variants.find((variant) => variant.returns.length === 0)?.usage,
		"world:query( def, onMatch )",
	);
	const collecting = variants.find((variant) => variant.returns.length > 0);
	assert.equal(collecting?.usage, "matches = world:query( def, onMatch )");
	assert.equal(collecting?.returns[0]?.name, "matches");
	assert.equal(collecting?.returns[0]?.types, "table");
});
