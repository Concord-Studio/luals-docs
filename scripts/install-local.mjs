import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { name, version, bin } = require("../package.json");
const binName =
	typeof bin === "string" ? path.basename(bin) : Object.keys(bin)[0];
const tarball = path.join(
	root,
	`${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`,
);

function run(command) {
	execSync(command, { cwd: root, stdio: "inherit" });
}

const binDir = process.env.PNPM_HOME || path.dirname(process.execPath);

try {
	run("pnpm clean");
	run("pnpm build");
	run("pnpm pack");
	run(
		`pnpm add --global --config.global-bin-dir=${JSON.stringify(binDir)} ${JSON.stringify(tarball)}`,
	);
} finally {
	rmSync(tarball, { force: true });
}

console.log(`Installed ${name}@${version} at ${path.join(binDir, binName)}`);
