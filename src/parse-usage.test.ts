import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { ResolvedConfig } from "./config.js";
import { parseLua } from "./lua-source.js";
import { parseSourcePages } from "./parse-source.js";

test("a long @usage comment keeps the snippet at any bracket level", () => {
	const lua = parseLua(`---@docs kind class
---@class Entity
--- Gives.
---@param name string
--[[@usage
entity:give("x")
]]
--[===[@usage
entity:give("y")
]===]
function Entity:give(name)
end
`);
	const give = lua.functions.find((fn) => fn.name === "give");
	assert.deepEqual(give?.blockUsages, ['entity:give("x")', 'entity:give("y")']);
});

test("multiple ---@usage tags become separate blocks", () => {
	const root = path.join(os.tmpdir(), `luals-docs-usage2-${process.pid}`);
	const inputDir = "lib";
	mkdirSync(path.join(root, inputDir), { recursive: true });
	const rel = `${inputDir}/entity.lua`;
	writeFileSync(
		path.join(root, rel),
		`---@docs kind class
---@class Entity
---@usage entity:give("a")
---@usage entity:give("b")
---@param name string
function Entity:give(name)
end
`,
		"utf8",
	);
	const config: ResolvedConfig = {
		configPath: path.join(root, ".luals-docs.json"),
		workspaceRoot: root,
		inputDir,
		outputDir: path.join(root, "out"),
		routePrefix: "api",
		groups: [{ label: "Classes", kinds: ["class"] }],
		pages: [rel],
		templatesDir: path.join(root, "templates"),
	};
	const pages = parseSourcePages(config);
	const give = pages[0]?.members.find((m) => m.name === "give");
	assert.deepEqual(give?.usageBlocks, ['entity:give("a")', 'entity:give("b")']);
	rmSync(root, { recursive: true, force: true });
});

test("a long string does not create a class or a method", () => {
	const lua = parseLua(`---@docs kind class
---@class Entity
--- Page.
local snippet = [[
---@class Fake
function Entity:fake(name)
end
]]
--- Real method.
---@param name string
function Entity:real(name)
end
`);
	assert.deepEqual(
		lua.headerLines.filter((line) => line.includes("@class")),
		["---@class Entity"],
	);
	assert.deepEqual(
		lua.functions.map((fn) => fn.name),
		["real"],
	);
});

test("a usage comment written inside a string is not a usage block", () => {
	const lua = parseLua(`---@docs kind class
---@class Entity
--- Real.
local example = "--[[@usage fake() ]]"
--- Real method.
---@param name string
function Entity:real(name)
end
`);
	const real = lua.functions.find((fn) => fn.name === "real");
	assert.deepEqual(real?.blockUsages, []);
	assert.equal(
		lua.functions.some((fn) => fn.name === "fake"),
		false,
	);
});

test("---@usage multiline in member doc", () => {
	const root = path.join(os.tmpdir(), `luals-docs-usage-${process.pid}`);
	const inputDir = "lib";
	mkdirSync(path.join(root, inputDir), { recursive: true });
	const rel = `${inputDir}/entity.lua`;
	writeFileSync(
		path.join(root, rel),
		`---@docs kind class
---@class Entity
--- Extra args go to populate.
---@usage
--- Concord.Component("position", function (c, x, y) c.x = x end)
--- entity:give("position", 1, 2)
---@param name string
---@return Entity
function Entity:give(name)
end
`,
		"utf8",
	);
	const config: ResolvedConfig = {
		configPath: path.join(root, ".luals-docs.json"),
		workspaceRoot: root,
		inputDir,
		outputDir: path.join(root, "out"),
		routePrefix: "api",
		groups: [{ label: "Classes", kinds: ["class"] }],
		pages: [rel],
		templatesDir: path.join(root, "templates"),
	};
	const pages = parseSourcePages(config);
	const give = pages[0]?.members.find((m) => m.name === "give");
	assert.ok(give?.usageBlocks[0]?.includes('give("position"'));
	rmSync(root, { recursive: true, force: true });
});
