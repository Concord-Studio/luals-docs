import assert from "node:assert/strict";
import test from "node:test";
import { memberCallVariants } from "./call-signature.js";
import type { ParsedMember } from "./parse-source.js";
import { renderMember } from "./render-member.js";
import { renderSeeAlsoSection } from "./see-index.js";
import { loadTemplates, renderDocument } from "./templates.js";
import type { TypeIndex } from "./type-index.js";

const templates = loadTemplates();
const noTypes: TypeIndex = new Map();

test("frontmatter quotes text and keeps order 0", () => {
	const page = renderDocument(
		templates,
		{
			title: "World: give",
			description: "A world.",
			route: "api/world",
			kind: "hub",
			order: 0,
		},
		"## Require",
	);
	assert.match(page, /title: "World: give"/);
	assert.match(page, /description: "A world\."/);
	assert.match(page, /slug: api\/world\nsidebar:\n {2}order: 0\n/);
	assert.match(page, /maxHeadingLevel: 2\n---\n\n## Require\n/);
	assert.doesNotMatch(page, /hidden:/);
});

test("member and type pages hide the sidebar entry", () => {
	for (const kind of ["member", "type"] as const) {
		const page = renderDocument(
			templates,
			{
				title: "World:emit",
				description: "Emits.",
				route: "api/world/emit",
				kind,
			},
			"Body",
		);
		assert.match(page, /sidebar:\n {2}hidden: true\n/);
		assert.doesNotMatch(page, /order:/);
	}
});

test("member template renders the signature, arguments, and parent link", () => {
	const member: ParsedMember = {
		name: "update",
		callSeparator: ":",
		signature: "function Widget:update(value)",
		summary: "Updates it.",
		description: "",
		usageBlocks: ["widget:update(1)"],
		params: [{ name: "value", types: "string", desc: "Next value" }],
		returns: [],
		overloads: [],
		see: [],
	};
	assert.equal(memberCallVariants(member)[0]?.usage, "widget:update( value )");

	const body = renderMember(
		member,
		noTypes,
		new Map(),
		{ title: "Widget", href: "/api/widget" },
		templates,
	);
	assert.match(body, /^\[← Widget\]\(\/api\/widget\)\n\nUpdates it\./);
	assert.match(body, /```lua\nwidget:update\( value \)\n```/);
	assert.match(body, /### Arguments\n\n\| Name \| Type \| Description \|/);
	assert.match(body, /\| `value` \| string \| Next value \|/);
	assert.match(body, /### Usage\n\n```lua\nwidget:update\(1\)\n```/);
});

test("index template keeps one link per line", () => {
	const md = templates
		.render("index", {
			groups: [
				{
					label: "Classes",
					items: [
						{ label: "A", href: "/a", blurb: "" },
						{ label: "B", href: "/b", blurb: "Bee" },
					],
				},
			],
		})
		.trimEnd();
	assert.equal(md, "## Classes\n\n- [A](/a)\n- [B](/b) — Bee");
});

test("see template links resolved names and quotes unknown ones", () => {
	const md = renderSeeAlsoSection(
		["Widget#update", "Missing#nope"],
		new Map([
			["Widget#update", { href: "/api/widget/update", label: "Widget:update" }],
		]),
		noTypes,
		templates,
	);
	assert.equal(
		md,
		[
			"### See also",
			"",
			"- [Widget:update](/api/widget/update)",
			"- `Missing:nope`",
		].join("\n"),
	);
});
