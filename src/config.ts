import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { discoverPagesInInputDir } from "./discover-pages.js";
import { defaultTemplatesDir } from "./templates.js";

export const CONFIG_FILENAME = ".luals-docs.json";

export interface KindGroup {
	label: string;
	kinds: string[];
}

export interface LualsDocsConfigFile {
	schemaVersion?: number;
	workspaceRoot?: string;
	inputDir?: string;
	outputDir?: string;
	/** If set, write the documentation index JSON to this path. */
	indexJson?: string;
	/** Removed. Use `indexJson`. */
	sidebarPath?: string;
	/** Directory of Nunjucks page templates. Defaults to the built-in set. */
	templatesDir?: string;
	routePrefix?: string;
	/**
	 * Lua identifier. A leading `Namespace.` is removed from documented type
	 * names, type strings, and `@see` targets. The namespace class itself stays.
	 */
	namespace?: string;
	/** Ordered groups of `@docs kind` names. */
	groups?: KindGroup[];
	/** Removed. Use `groups`. */
	sidebar?: KindGroup[];
}

export interface ResolvedConfig {
	configPath: string;
	workspaceRoot: string;
	inputDir: string;
	outputDir: string;
	indexJson?: string;
	templatesDir: string;
	routePrefix: string;
	namespace?: string;
	groups: KindGroup[];
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

function assertNamespace(namespace: unknown): asserts namespace is string {
	if (
		typeof namespace !== "string" ||
		!/^[A-Za-z_][A-Za-z0-9_]*$/.test(namespace)
	) {
		throw new Error(`${CONFIG_FILENAME}: "namespace" must be a Lua identifier`);
	}
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

	if (raw.sidebar !== undefined) {
		throw new Error(`${CONFIG_FILENAME}: "sidebar" was renamed to "groups"`);
	}

	const groups = raw.groups ?? [];
	if (!groups.length) {
		throw new Error(`${CONFIG_FILENAME}: "groups" must be a non-empty array`);
	}

	for (const [i, group] of groups.entries()) {
		if (!group.label || !group.kinds?.length) {
			throw new Error(
				`${CONFIG_FILENAME}: groups[${i}] requires label and non-empty kinds`,
			);
		}
		for (const kind of group.kinds) {
			assertKindName(kind, `groups[${i}]`);
		}
	}

	const pages = discoverPagesInInputDir(workspaceRoot, inputDir);
	if (!pages.length) {
		throw new Error(
			`${CONFIG_FILENAME}: no documented Lua files under ${inputDir} (add ---@docs kind to files you want in the API)`,
		);
	}

	if (raw.sidebarPath !== undefined) {
		throw new Error(
			`${CONFIG_FILENAME}: "sidebarPath" was renamed to "indexJson"`,
		);
	}

	const outputDir = resolveFrom(workspaceRoot, raw.outputDir ?? "docs/api");
	const routePrefix = raw.routePrefix ?? "api";
	if (raw.namespace !== undefined) assertNamespace(raw.namespace);
	const namespace = raw.namespace;
	const indexJson = raw.indexJson
		? resolveFrom(workspaceRoot, raw.indexJson)
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
		indexJson,
		templatesDir,
		routePrefix,
		namespace,
		groups,
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
