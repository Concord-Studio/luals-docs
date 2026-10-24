import type { ResolvedConfig } from "./config.js";
import { type GenerateResult, runGenerate } from "./generate.js";

/** Parse Lua sources and write Markdown; remove stale output files. */
export function runDocsBuild(
	config: ResolvedConfig,
	options?: { outDir?: string; indexJson?: string },
): GenerateResult {
	return runGenerate({
		config,
		outDir: options?.outDir ?? config.outputDir,
		indexJson: options?.indexJson,
	});
}
