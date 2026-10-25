import assert from "node:assert/strict";
import test from "node:test";
import { parseTypesFromHeaderLines } from "./parse-types.js";
import {
	parseFieldTag,
	parseParam,
	parseReturnTag,
} from "./type-parse-utils.js";

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

test("namespace strips Concord. and keeps the namespace class", () => {
	const lines = [
		"---@class Concord.Key : Concord.ComponentClass",
		"---@field __world? Concord.World",
		"---@field constructor? fun(def: Concord.FilterDefinition): Concord.Pool",
		"---@alias Concord.ParsedFilter (string|boolean)[]",
		"---@class Concord",
	];

	const types = parseTypesFromHeaderLines(lines, "Concord");
	assert.equal(types[0]?.name, "Key");
	assert.equal(types[0]?.extends, "ComponentClass");
	assert.equal(types[0]?.fields[0]?.types, "World");
	assert.equal(types[0]?.fields[1]?.types, "fun(def: FilterDefinition): Pool");

	assert.equal(types[1]?.name, "ParsedFilter");
	assert.equal(types[2]?.name, "Concord");

	const dotted = parseTypesFromHeaderLines(lines);
	assert.equal(dotted[0]?.name, "Concord.Key");
	assert.equal(dotted[0]?.extends, "Concord.ComponentClass");
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

test("parseParam keeps a generic type together", () => {
	const param = parseParam(
		"definition? table<string, Concord.FilterDefinition> Map of pool names",
	);
	assert.equal(param.name, "definition");
	assert.equal(param.types, "table<string, Concord.FilterDefinition>");
	assert.equal(param.desc, "Map of pool names");
});

test("parseReturnTag reads a LuaLS return name and a hash description", () => {
	const named = parseReturnTag(
		"Concord.ComponentClass|string componentClass ComponentClass on success",
	);
	assert.equal(named.types, "Concord.ComponentClass|string");
	assert.equal(named.name, "componentClass");
	assert.equal(named.desc, "ComponentClass on success");

	const prose = parseReturnTag("table Serialized Entity data");
	assert.equal(prose.types, "table");
	assert.equal(prose.name, "");
	assert.equal(prose.desc, "Serialized Entity data");

	const spaced = parseReturnTag("fun(e: Entity) | table Callback or storage");
	assert.equal(spaced.types, "fun(e: Entity) | table");
	assert.equal(spaced.name, "");
	assert.equal(spaced.desc, "Callback or storage");

	const hashed = parseReturnTag("number # The first number");
	assert.equal(hashed.types, "number");
	assert.equal(hashed.name, "");
	assert.equal(hashed.desc, "The first number");
});
