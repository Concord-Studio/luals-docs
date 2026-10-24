import { createRequire } from "node:module";
import { marked } from "marked";
import type { Environment } from "nunjucks";

const require = createRequire(import.meta.url);
const { runtime } = require("nunjucks") as {
	runtime: { SafeString: new (value: string) => object };
};

function markdownHtml(value: unknown, inline: boolean): object {
	const text = value == null ? "" : String(value);
	const html = inline
		? marked.parseInline(text, { async: false })
		: marked.parse(text, { async: false });
	return new runtime.SafeString(String(html).trim());
}

/** Block Markdown, including the surrounding paragraph. */
export function renderMarkdown(value: unknown): object {
	return markdownHtml(value, false);
}

/** Inline Markdown for a link, sentence, or table cell. */
export function renderInline(value: unknown): object {
	return markdownHtml(value, true);
}

export function registerMarkdownHelpers(env: Environment): void {
	env.addGlobal("renderMarkdown", renderMarkdown);
	env.addGlobal("renderInline", renderInline);
	env.addFilter("renderMarkdown", renderMarkdown);
	env.addFilter("renderInline", renderInline);
}
