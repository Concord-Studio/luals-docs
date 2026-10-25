import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { ResolvedConfig } from "./config.js";
import { parseSourcePages } from "./parse-source.js";

const SOURCE = `--- Prefer Concord.Entity when constructing.
---@docs kind class
---@class Concord.Entity
---@field private __world? Concord.World
---@class Concord.Key : Concord.ComponentClass
---@field constructor? fun(def: Concord.FilterDefinition): Concord.Pool
---@alias Concord.ParsedFilter (string|boolean)[]
---@class Concord

--- Gives a component.
---@see Concord.Component#removed
---@see Concord.Components.reject
---@see Concord.Entity.SERIALIZE_BY_DEFAULT
---@param component Concord.Component|nil Instance of Concord.Component
---@return Concord.Entity
---@overload fun(self: Concord.Entity, component: Concord.Component): Concord.Entity
--- Keeps Concord.Component in the prose.
function Entity:give(component)
end
`;

function pagesFrom(root: string, namespace?: string) {
	const inputDir = "lib";
	mkdirSync(path.join(root, inputDir), { recursive: true });
	const rel = `${inputDir}/entity.lua`;
	writeFileSync(path.join(root, rel), SOURCE, "utf8");
	const config: ResolvedConfig = {
		configPath: path.join(root, ".luals-docs.json"),
		workspaceRoot: root,
		inputDir,
		outputDir: path.join(root, "out"),
		routePrefix: "api",
		namespace,
		groups: [{ label: "Classes", kinds: ["class"] }],
		pages: [rel],
		templatesDir: path.join(root, "templates"),
	};
	return parseSourcePages(config);
}

test("namespace strips type names and @see targets but not prose", () => {
	const root = path.join(os.tmpdir(), `luals-docs-parse-${process.pid}`);
	try {
		const page = pagesFrom(root, "Concord")[0];
		assert.ok(page);
		assert.equal(page.className, "Entity");
		assert.equal(page.title, "Entity");
		assert.match(page.summary, /Prefer Concord\.Entity/);

		const entity = page.types.find((type) => type.name === "Entity");
		assert.equal(entity?.fields[0]?.types, "World");

		const key = page.types.find((type) => type.name === "Key");
		assert.equal(key?.extends, "ComponentClass");
		assert.equal(key?.fields[0]?.types, "fun(def: FilterDefinition): Pool");

		assert.equal(
			page.types.some((type) => type.name === "ParsedFilter"),
			true,
		);
		assert.equal(
			page.types.some((type) => type.name === "Concord"),
			true,
		);

		const give = page.members.find((member) => member.name === "give");
		assert.ok(give);
		assert.deepEqual(give.see, [
			"Component#removed",
			"Components.reject",
			"Entity.SERIALIZE_BY_DEFAULT",
		]);
		assert.equal(give.params[0]?.types, "Component|nil");
		assert.match(give.params[0]?.desc ?? "", /Concord\.Component/);
		assert.equal(give.returns[0]?.types, "Entity");
		assert.equal(
			give.overloads[0]?.signature,
			"fun(self: Entity, component: Component): Entity",
		);
		assert.match(give.overloads[0]?.description ?? "", /Concord\.Component/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("a missing namespace leaves dotted type names in place", () => {
	const root = path.join(os.tmpdir(), `luals-docs-parse-dotted-${process.pid}`);
	try {
		const page = pagesFrom(root)[0];
		assert.equal(page?.className, "Concord.Entity");
		assert.equal(page?.title, "Concord.Entity");
		const give = page?.members.find((member) => member.name === "give");
		assert.equal(give?.returns[0]?.types, "Concord.Entity");
		assert.equal(give?.see[0], "Concord.Component#removed");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
