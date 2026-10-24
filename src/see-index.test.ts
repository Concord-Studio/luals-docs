import assert from "node:assert/strict";
import test from "node:test";
import type { ParsedPage } from "./parse-source.js";
import {
	buildSeeIndex,
	canonicalSeeKey,
	renderSeeAlsoSection,
	resolveSeeHref,
	seeDisplayLabel,
} from "./see-index.js";
import type { TypeIndex } from "./type-index.js";

test("seeDisplayLabel uses colon for instance methods", () => {
	const seeIndex = buildSeeIndex([
		{
			className: "World",
			title: "World",
			routeSlug: "api/world",
			members: [{ name: "emit", callSeparator: ":" }],
		} as ParsedPage,
	]);
	assert.equal(seeDisplayLabel("World#emit", seeIndex), "World:emit");
});

test("seeDisplayLabel uses dot for module functions", () => {
	const seeIndex = buildSeeIndex([
		{
			className: "Utils",
			title: "Utils",
			routeSlug: "api/utils",
			members: [{ name: "shallowCopy", callSeparator: "." }],
		} as ParsedPage,
	]);
	assert.equal(
		seeDisplayLabel("Utils#shallowCopy", seeIndex),
		"Utils.shallowCopy",
	);
});

test("canonicalSeeKey accepts hash colon or dot", () => {
	assert.equal(canonicalSeeKey("Utils.shallowCopy"), "Utils#shallowCopy");
	assert.equal(canonicalSeeKey("World:emit"), "World#emit");
});

test("renderSeeAlsoSection dedupes and lists links", () => {
	const seeIndex = buildSeeIndex([
		{
			className: "World",
			title: "World",
			routeSlug: "api/world",
			members: [
				{ name: "emit", callSeparator: ":" },
				{ name: "addSystem", callSeparator: ":" },
			],
		} as ParsedPage,
	]);
	const typeIndex: TypeIndex = new Map();
	const md = renderSeeAlsoSection(
		["World#addSystem", "World#emit", "World#emit"],
		seeIndex,
		typeIndex,
	);
	assert.match(md, /### See also/);
	assert.match(md, /\[World:addSystem\]\(\/api\/world\/add-system\)/);
	assert.match(md, /\[World:emit\]\(\/api\/world\/emit\)/);
	assert.equal(md.split("World:emit").length, 2);
});

test("resolveSeeHref falls back to type index", () => {
	const typeIndex: TypeIndex = new Map([
		[
			"Entity",
			{
				routeSlug: "api/entity",
				anchor: "entity",
				relFile: "lib/entity.lua",
			},
		],
	]);
	assert.equal(
		resolveSeeHref("Entity", new Map(), typeIndex),
		"/api/entity#entity",
	);
});
