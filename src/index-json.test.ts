import assert from "node:assert/strict";
import test from "node:test";
import type { ResolvedConfig } from "./config.js";
import { buildIndexJson } from "./index-json.js";
import type { ParsedPage } from "./parse-source.js";

function page(fields: {
	title: string;
	relFile: string;
	route: string;
	kind: string;
	index?: boolean;
	order?: number;
}): ParsedPage {
	return {
		title: fields.title,
		relFile: fields.relFile,
		outputRelPath: "out.md",
		routeSlug: fields.route,
		kind: fields.kind,
		docs: {
			enabled: true,
			index: fields.index ?? false,
			order: fields.order,
		},
		summary: "",
		exports: [],
		types: [],
		members: [],
	};
}

test("index JSON lists root indexes, then kind groups, with titles and routes", () => {
	const config = {
		inputDir: "lib",
		groups: [{ label: "Classes", kinds: ["class"] }],
	} as ResolvedConfig;
	const index = buildIndexJson(
		[
			page({
				title: "API",
				relFile: "lib/init.lua",
				route: "api",
				kind: "module",
				index: true,
			}),
			page({
				title: "World",
				relFile: "lib/world.lua",
				route: "api/world",
				kind: "class",
				order: 2,
			}),
			page({
				title: "Entity",
				relFile: "lib/entity.lua",
				route: "api/entity",
				kind: "class",
				order: 1,
			}),
		],
		config,
	);
	assert.deepEqual(index, [
		{ title: "API", route: "api" },
		{
			label: "Classes",
			items: [
				{ title: "Entity", route: "api/entity" },
				{ title: "World", route: "api/world" },
			],
		},
	]);
});

test("index JSON places nested indexes at their groups array position", () => {
	const config = {
		inputDir: "lib",
		groups: [
			{ label: "Classes", kinds: ["class"] },
			{ label: "Modules", kinds: ["module"] },
			{ label: "Builtins", kinds: ["builtin"] },
		],
	} as ResolvedConfig;
	const index = buildIndexJson(
		[
			page({
				title: "API",
				relFile: "lib/init.lua",
				route: "api",
				kind: "module",
				index: true,
			}),
			page({
				title: "Builtins",
				relFile: "lib/builtins/init.lua",
				route: "api/builtins",
				kind: "module",
				index: true,
			}),
			page({
				title: "Key",
				relFile: "lib/builtins/key.lua",
				route: "api/builtins/key",
				kind: "builtin",
				order: 1,
			}),
			page({
				title: "Serializable",
				relFile: "lib/builtins/serializable.lua",
				route: "api/builtins/serializable",
				kind: "builtin",
				order: 2,
			}),
			page({
				title: "World",
				relFile: "lib/world.lua",
				route: "api/world",
				kind: "class",
				order: 2,
			}),
			page({
				title: "Entity",
				relFile: "lib/entity.lua",
				route: "api/entity",
				kind: "class",
				order: 1,
			}),
			page({
				title: "Utils",
				relFile: "lib/utils.lua",
				route: "api/utils",
				kind: "module",
			}),
		],
		config,
	);
	assert.deepEqual(index, [
		{ title: "API", route: "api" },
		{
			label: "Classes",
			items: [
				{ title: "Entity", route: "api/entity" },
				{ title: "World", route: "api/world" },
			],
		},
		{
			label: "Modules",
			items: [{ title: "Utils", route: "api/utils" }],
		},
		{
			label: "Builtins",
			items: [
				{ title: "Builtins", route: "api/builtins" },
				{ title: "Key", route: "api/builtins/key" },
				{ title: "Serializable", route: "api/builtins/serializable" },
			],
		},
	]);
});
