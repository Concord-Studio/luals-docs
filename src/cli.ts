#!/usr/bin/env node
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig, loadConfigFromCwd } from "./config.js";
import type { GenerateResult } from "./generate.js";
import { runDocsBuild } from "./run-docs-build.js";

const require = createRequire(import.meta.url);

export class CliError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CliError";
	}
}

export interface CliArgs {
	help: boolean;
	version: boolean;
	configPath?: string;
	outDir?: string;
	sidebarPath?: string;
}

const VALUE_FLAGS: Record<
	string,
	keyof Pick<CliArgs, "configPath" | "outDir" | "sidebarPath">
> = {
	"--config": "configPath",
	"-c": "configPath",
	"--out": "outDir",
	"-o": "outDir",
	"--sidebar": "sidebarPath",
	"-s": "sidebarPath",
};

export function readVersion(): string {
	const pkg = require("../package.json") as { version?: string };
	return pkg.version ?? "0.0.0";
}

export function usageText(): string {
	return [
		"luals-docs",
		"",
		"Generate Starlight Markdown from Lua doc comments.",
		"",
		"Usage",
		"  luals-docs [build] [options]",
		"",
		"Options",
		"  -c, --config <file>    Path to .luals-docs.json",
		"                         Default: search parent directories",
		"  -o, --out <dir>        Markdown output directory",
		"                         Overrides config outputDir",
		"  -s, --sidebar <file>   Starlight sidebar JSON path",
		"                         Overrides config sidebarPath",
		"  -h, --help             Show this help",
		"  -v, --version          Show the version",
		"",
		"build is optional. luals-docs and luals-docs build do the same thing.",
		"Flag values may also be passed as --flag=value.",
	].join("\n");
}

export function formatBuildSummary(result: GenerateResult): string {
	const pages = result.pageCount === 1 ? "1 page" : `${result.pageCount} pages`;
	const files = result.fileCount === 1 ? "1 file" : `${result.fileCount} files`;
	const lines = [`Wrote ${files} (${pages}) to ${result.outDir}`];
	if (result.removedCount > 0) {
		const stale =
			result.removedCount === 1
				? "1 stale file"
				: `${result.removedCount} stale files`;
		lines.push(`Removed ${stale}`);
	}
	if (result.sidebarPath) {
		lines.push(`Wrote sidebar to ${result.sidebarPath}`);
	}
	return lines.join("\n");
}

function takeFlagValue(
	argv: string[],
	index: number,
	name: string,
	inline?: string,
): string {
	if (inline !== undefined) {
		if (inline === "") throw new CliError(`Missing value for ${name}`);
		return inline;
	}
	const value = argv[index + 1];
	if (value === undefined || value.startsWith("-")) {
		throw new CliError(`Missing value for ${name}`);
	}
	return value;
}

export function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = { help: false, version: false };

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === undefined) break;
		if (arg === "build") continue;
		if (arg === "--help" || arg === "-h") {
			args.help = true;
			continue;
		}
		if (arg === "--version" || arg === "-v") {
			args.version = true;
			continue;
		}

		let name = arg;
		let inline: string | undefined;
		if (arg.startsWith("-") && arg.includes("=")) {
			const eq = arg.indexOf("=");
			name = arg.slice(0, eq);
			inline = arg.slice(eq + 1);
		}

		const key = VALUE_FLAGS[name];
		if (key) {
			const value = takeFlagValue(argv, i, name, inline);
			if (inline === undefined) i++;
			args[key] = value;
			continue;
		}

		if (arg.startsWith("-")) throw new CliError(`Unknown flag: ${arg}`);
		throw new CliError(`Unknown command: ${arg}`);
	}

	return args;
}

function reportError(err: unknown): void {
	if (err instanceof CliError) {
		console.error(`luals-docs: ${err.message}`);
		console.error("Run luals-docs --help for usage.");
		return;
	}
	if (err instanceof Error) {
		console.error(`luals-docs: ${err.message}`);
		if (err.name !== "Error") console.error(err.stack);
		return;
	}
	console.error("luals-docs:", err);
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log(usageText());
		return;
	}
	if (args.version) {
		console.log(readVersion());
		return;
	}

	const config = args.configPath
		? loadConfig(args.configPath)
		: loadConfigFromCwd();
	const result = runDocsBuild(config, {
		outDir: args.outDir,
		sidebarPath: args.sidebarPath,
	});
	console.log(formatBuildSummary(result));
}

function isCliEntry(): boolean {
	const entry = process.argv[1];
	if (!entry) return false;
	return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isCliEntry()) {
	main().catch((err) => {
		reportError(err);
		process.exitCode = 1;
	});
}
