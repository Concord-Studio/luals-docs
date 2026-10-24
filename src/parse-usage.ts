/** Merge `---@usage` blocks from a doc comment with long-comment `@usage` blocks. */
export function mergeUsageBlocks(
	fromDoc: string[],
	fromBlock: string[],
): string[] {
	return [...fromBlock, ...fromDoc];
}
