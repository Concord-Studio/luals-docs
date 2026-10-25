import assert from "node:assert/strict";
import test from "node:test";
import { linkifyTypes } from "./link-types.js";
import type { TypeIndex } from "./type-index.js";

function index(entries: Record<string, string>): TypeIndex {
	const map: TypeIndex = new Map();
	for (const [name, slug] of Object.entries(entries)) {
		map.set(name, {
			routeSlug: slug,
			anchor: name.toLowerCase(),
			relFile: `${name.toLowerCase()}.lua`,
		});
	}
	return map;
}

test("linkifyTypes links known names in unions", () => {
	const out = linkifyTypes("World|nil", index({ World: "api/world" }));
	assert.match(out, /\[World\]\(\/api\/world#world\)/);
	assert.match(out, /\|nil/);
});

test("linkifyTypes links types inside fun()", () => {
	const out = linkifyTypes(
		"fun(self: Entity, name: string): boolean",
		index({ Entity: "api/entity" }),
	);
	assert.match(out, /\[Entity\]\(\/api\/entity#entity\)/);
	assert.match(out, /string/);
});

test("linkifyTypes links a dotted type as one name", () => {
	const out = linkifyTypes(
		"Concord.Entity|nil",
		index({
			Concord: "api",
			"Concord.Entity": "api/entity",
		}),
	);
	assert.match(out, /\[Concord\.Entity\]\(\/api\/entity#concord\.entity\)/);
	assert.equal(out.includes("[Concord]"), false);
	assert.match(out, /\|nil/);
});

test("linkifyTypes does not link a namespace prefix inside an unknown dotted name", () => {
	const out = linkifyTypes("Concord.World", index({ Concord: "api" }));
	assert.equal(out, "Concord.World");
});

test("linkifyTypes links dotted names inside fun()", () => {
	const out = linkifyTypes(
		"fun(self: Concord.Entity): Concord.World",
		index({
			"Concord.Entity": "api/entity",
			"Concord.World": "api/world",
		}),
	);
	assert.match(out, /\[Concord\.Entity\]\(\/api\/entity#concord\.entity\)/);
	assert.match(out, /\[Concord\.World\]\(\/api\/world#concord\.world\)/);
});

test("linkifyTypes leaves primitives unchanged", () => {
	const out = linkifyTypes("table|string", index({}));
	assert.equal(out, "table|string");
});
