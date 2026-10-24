import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import os from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CliError, formatBuildSummary, parseArgs, usageText } from "./cli.js";

const cliPath = fileURLToPath(new URL("./cli.js", import.meta.url));

function runCli(args: string[], cwd = process.cwd()) {
	return spawnSync(process.execPath, [cliPath, ...args], {
		cwd,
		encoding: "utf8",
	});
}

test("parseArgs reads flags, equals form, and the build alias", () => {
	const args = parseArgs(["build", "--out=docs/api", "-c", "cfg.json"]);
	assert.equal(args.help, false);
	assert.equal(args.version, false);
	assert.equal(args.configPath, "cfg.json");
	assert.equal(args.outDir, "docs/api");
	assert.equal(args.indexJson, undefined);
});

test("parseArgs rejects unknown input and missing values", () => {
	assert.throws(() => parseArgs(["--nope"]), CliError);
	assert.throws(
		() => parseArgs(["publish"]),
		(err: unknown) => {
			assert.ok(err instanceof CliError);
			assert.match(err.message, /Unknown command: publish/);
			return true;
		},
	);
	assert.throws(
		() => parseArgs(["--out"]),
		(err: unknown) => {
			assert.ok(err instanceof CliError);
			assert.match(err.message, /Missing value for --out/);
			return true;
		},
	);
	assert.throws(() => parseArgs(["--out", "--config", "cfg.json"]), CliError);
});

test("usage text lists the config, output, and index JSON flags", () => {
	const help = usageText();
	assert.match(help, /--config <file>/);
	assert.match(help, /--out <dir>/);
	assert.match(help, /--index-json <file>/);
});

test("formatBuildSummary reports files, removals, and index JSON", () => {
	const text = formatBuildSummary({
		manifest: { groups: [], symbolIndex: {} },
		outDir: "/tmp/docs",
		pageCount: 2,
		fileCount: 5,
		removedCount: 1,
		indexJson: "/tmp/index.json",
	});
	assert.match(text, /Wrote 5 files \(2 pages\) to \/tmp\/docs/);
	assert.match(text, /Removed 1 stale file/);
	assert.match(text, /Wrote index JSON to \/tmp\/index.json/);
});

test("--help prints usage and exits 0", () => {
	const result = runCli(["--help"]);
	assert.equal(result.status, 0);
	assert.match(result.stdout, /--config <file>/);
	assert.equal(result.stderr, "");
});

test("--version prints the package version", () => {
	const result = runCli(["-v"]);
	assert.equal(result.status, 0);
	assert.match(result.stdout, /^\d+\.\d+\.\d+\n$/);
});

test("unknown flags exit 1 with a usage hint and no stack", () => {
	const result = runCli(["--nope"]);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Unknown flag: --nope/);
	assert.match(result.stderr, /luals-docs --help/);
	assert.doesNotMatch(result.stderr, /\n\s+at /);
});

test("a missing config reports the search path", () => {
	const result = runCli([], os.tmpdir());
	assert.equal(result.status, 1);
	assert.match(result.stderr, /\.luals-docs\.json not found/);
	assert.doesNotMatch(result.stderr, /\n\s+at /);
});
