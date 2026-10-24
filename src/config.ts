import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { discoverPagesInInputDir } from "./discover-pages.js";
import { defaultTemplatesDir } from "./templates.js";

export const CONFIG_FILENAME = ".luals-docs.json";

export interface SidebarGroupSpec {
	label: string;
	kinds: string[];
}

export interface LualsDocsConfigFile {
	schemaVersion?: number;
	workspaceRoot?: string;
	inputDir?: string;
	outputDir?: string;
	/** If set, write Starlight sidebar JSON (groups + slugs) to this path. */
	sidebarPath?: string;
	/** Directory of Nunjucks page templates. Defaults to the built-in set. */
	templatesDir?: string;
	routePrefix?: string;
	sidebar?: SidebarGroupSpec[];
}

export interface ResolvedConfig {
	configPath: string;
	workspaceRoot: string;
	inputDir: string;
	outputDir: string;
	sidebarPath?: string;
	templatesDir: string;
	routePrefix: string;
	sidebar: SidebarGroupSpec[];
	/** Workspace-relative `.lua` paths (discovered under `inputDir`). */
	pages: string[];
}

function resolveFrom(baseDir: string, rel: string): string {
	return path.resolve(baseDir, rel);
}

function normalizeDirRel(rel: string): string {
	return rel.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function findConfigPath(startDir: string): string {
	let dir = path.resolve(startDir);
	for (;;) {
		const candidate = path.join(dir, CONFIG_FILENAME);
		if (existsSync(candidate)) {
			return candidate;
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			break;
		}
		dir = parent;
	}
	throw new Error(
		`${CONFIG_FILENAME} not found (searched upward from ${path.resolve(startDir)})`,
	);
}

function assertKindName(
	kind: unknown,
	context: string,
): asserts kind is string {
	if (typeof kind !== "string" || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(kind)) {
		throw new Error(
			`${context}: invalid kind ${JSON.stringify(kind)} (expected a name such as "module" or "class")`,
		);
	}
}

export function loadConfig(configPath: string): ResolvedConfig {
	const absConfigPath = path.resolve(configPath);
	if (!existsSync(absConfigPath)) {
		throw new Error(`Config file not found: ${absConfigPath}`);
	}

	let raw: LualsDocsConfigFile;
	try {
		raw = JSON.parse(
			readFileSync(absConfigPath, "utf8"),
		) as LualsDocsConfigFile;
	} catch (err) {
		throw new Error(
			`Failed to parse ${absConfigPath}: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	const configDir = path.dirname(absConfigPath);
	const workspaceRoot = raw.workspaceRoot
		? resolveFrom(configDir, raw.workspaceRoot)
		: configDir;

	const inputDir = normalizeDirRel(raw.inputDir ?? "");
	if (!inputDir) {
		throw new Error(`${CONFIG_FILENAME}: "inputDir" is required`);
	}

	if (!raw.sidebar?.length) {
		throw new Error(`${CONFIG_FILENAME}: "sidebar" must be a non-empty array`);
	}

	for (const [i, group] of raw.sidebar.entries()) {
		if (!group.label || !group.kinds?.length) {
			throw new Error(
				`${CONFIG_FILENAME}: sidebar[${i}] requires label and non-empty kinds`,
			);
		}
		for (const kind of group.kinds) {
			assertKindName(kind, `sidebar[${i}]`);
		}
	}

	const pages = discoverPagesInInputDir(workspaceRoot, inputDir);
	if (!pages.length) {
		throw new Error(
			`${CONFIG_FILENAME}: no documented Lua files under ${inputDir} (add ---@docs kind to files you want in the API)`,
		);
	}

	const outputDir = resolveFrom(workspaceRoot, raw.outputDir ?? "docs/api");
	const routePrefix = raw.routePrefix ?? "api";
	const sidebarPath = raw.sidebarPath
		? resolveFrom(workspaceRoot, raw.sidebarPath)
		: undefined;
	const templatesDir = raw.templatesDir
		? resolveFrom(workspaceRoot, raw.templatesDir)
		: defaultTemplatesDir();
	if (!existsSync(templatesDir)) {
		throw new Error(
			`${CONFIG_FILENAME}: templatesDir not found: ${templatesDir}`,
		);
	}

	return {
		configPath: absConfigPath,
		workspaceRoot,
		inputDir,
		outputDir,
		sidebarPath,
		templatesDir,
		routePrefix,
		sidebar: raw.sidebar,
		pages,
	};
}

export function loadConfigFromCwd(options?: {
	configPath?: string;
	startDir?: string;
}): ResolvedConfig {
	const configPath =
		options?.configPath ?? findConfigPath(options?.startDir ?? process.cwd());
	return loadConfig(configPath);
}
