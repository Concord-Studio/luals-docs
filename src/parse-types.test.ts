import assert from "node:assert/strict";
import test from "node:test";
import { parseTypesFromHeaderLines } from "./parse-types.js";
import { parseFieldTag } from "./type-parse-utils.js";

test("parseTypesFromHeaderLines collects classes, aliases, and scoped fields", () => {
	const lines = [
		"--- List of names.",
		"---@class FilterDefinition",
		"---@field [integer] string",
		"---@field constructor? fun(def: FilterDefinition): Pool",
		"---@alias ParsedFilter (string|boolean)[]",
		"---@docs kind class",
		"--- Used to filter entities.",
		"---@class Filter",
	];

	const types = parseTypesFromHeaderLines(lines);
	assert.equal(types.length, 3);

	const def = types[0];
	assert.equal(def?.kind, "class");
	assert.equal(def?.name, "FilterDefinition");
	assert.equal(def?.summary, "List of names.");
	assert.equal(def?.fields.length, 2);

	const alias = types[1];
	assert.equal(alias?.kind, "alias");
	assert.equal(alias?.name, "ParsedFilter");
	assert.match(alias?.definition ?? "", /boolean/);

	const filter = types[2];
	assert.equal(filter?.name, "Filter");
	assert.equal(filter?.summary, "Used to filter entities.");
});

test("parseFieldTag reads LuaLS visibility scopes", () => {
	const field = parseFieldTag("@field private __world? World");
	assert.ok(field);
	assert.equal(field.scope, "private");
	assert.equal(field.name, "__world?");
	assert.equal(field.types, "World");
});

test("parseFieldTag parses fun() field types", () => {
	const field = parseFieldTag(
		"@field constructor? fun(def: FilterDefinition): Pool",
	);
	assert.ok(field);
	assert.equal(field.name, "constructor?");
	assert.match(field.types, /^fun\(/);
	assert.equal(field.types.includes("FilterDefinition"), true);
});
