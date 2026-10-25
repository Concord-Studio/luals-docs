import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "./config.js";

function writeFixture(root: string, config: unknown): void {
	mkdirSync(path.join(root, "lib"), { recursive: true });
	writeFileSync(
		path.join(root, "lib/entity.lua"),
		"---@docs kind class\n",
		"utf8",
	);
	writeFileSync(
		path.join(root, ".luals-docs.json"),
		`${JSON.stringify(config, null, 2)}\n`,
		"utf8",
	);
}

test("groups loads in array order and sidebar is rejected", () => {
	const root = path.join(os.tmpdir(), `luals-docs-config-${process.pid}`);
	try {
		const groups = [
			{ label: "Classes", kinds: ["class"] },
			{ label: "Modules", kinds: ["module"] },
		];
		writeFixture(root, { inputDir: "lib", groups });
		const config = loadConfig(path.join(root, ".luals-docs.json"));
		assert.deepEqual(config.groups, groups);

		writeFixture(root, {
			inputDir: "lib",
			sidebar: [{ label: "Classes", kinds: ["class"] }],
		});
		assert.throws(
			() => loadConfig(path.join(root, ".luals-docs.json")),
			/"sidebar" was renamed to "groups"/,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("namespace must be a Lua identifier", () => {
	const root = path.join(os.tmpdir(), `luals-docs-namespace-${process.pid}`);
	const groups = [{ label: "Classes", kinds: ["class"] }];
	try {
		writeFixture(root, { inputDir: "lib", groups, namespace: "Concord" });
		const config = loadConfig(path.join(root, ".luals-docs.json"));
		assert.equal(config.namespace, "Concord");

		writeFixture(root, {
			inputDir: "lib",
			groups,
			namespace: "Concord.Entity",
		});
		assert.throws(
			() => loadConfig(path.join(root, ".luals-docs.json")),
			/"namespace" must be a Lua identifier/,
		);

		writeFixture(root, { inputDir: "lib", groups, namespace: "" });
		assert.throws(
			() => loadConfig(path.join(root, ".luals-docs.json")),
			/"namespace" must be a Lua identifier/,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
