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
		sidebar: [{ label: "Classes", kinds: ["class"] }],
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
