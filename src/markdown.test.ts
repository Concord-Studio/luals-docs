import assert from "node:assert/strict";
import test from "node:test";
import { Environment } from "nunjucks";
import { registerMarkdownHelpers } from "./markdown.js";

function render(source: string, text: string, autoescape: boolean): string {
	const env = new Environment(null, { autoescape });
	registerMarkdownHelpers(env);
	return env.renderString(source, { text });
}

test("renderMarkdown wraps a paragraph and keeps links", () => {
	assert.equal(
		render("{{ renderMarkdown(text) }}", "See [World](/api/world).", true),
		'<p>See <a href="/api/world">World</a>.</p>',
	);
});

test("renderInline stays inside a line and restores escaped pipes", () => {
	assert.equal(
		render(
			"{{ text | renderInline }}",
			"A [World](/api/world#world) and a \\| pipe",
			true,
		),
		'A <a href="/api/world#world">World</a> and a | pipe',
	);
});
