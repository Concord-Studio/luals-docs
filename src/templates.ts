import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Environment, FileSystemLoader } from "nunjucks";
import { registerMarkdownHelpers } from "./markdown.js";

const TEMPLATE_NAMES = [
	"page",
	"frontmatter",
	"hub",
	"require",
	"primary",
	"type",
	"type-body",
	"methods",
	"types",
	"index",
	"member",
	"see",
] as const;

export interface Templates {
	render(name: string, data: object): string;
}

export type PageKind = "hub" | "member" | "type";

export interface PageFrontmatter {
	title: string;
	description: string;
	route: string;
	kind: PageKind;
	order?: number;
}

export function defaultTemplatesDir(): string {
	return fileURLToPath(new URL("../templates", import.meta.url));
}

export function loadTemplates(dir = defaultTemplatesDir()): Templates {
	const override = path.resolve(dir);
	const builtin = path.resolve(defaultTemplatesDir());
	const roots = override === builtin ? [builtin] : [override, builtin];
	for (const name of TEMPLATE_NAMES) {
		const found = roots.some((root) =>
			existsSync(path.join(root, `${name}.njk`)),
		);
		if (!found) {
			throw new Error(`Template "${name}" not found in ${roots.join(" or ")}`);
		}
	}

	const env = new Environment(new FileSystemLoader(roots), {
		autoescape: false,
		trimBlocks: true,
		lstripBlocks: true,
	});
	env.addFilter("yaml", (value: unknown) => {
		const text = value == null ? "" : String(value);
		return JSON.stringify(text.replace(/\s+/g, " ").trim());
	});
	registerMarkdownHelpers(env);

	return {
		render(name: string, data: object) {
			return env.render(`${name}.njk`, data);
		},
	};
}

let defaults: Templates | undefined;

export function defaultTemplates(): Templates {
	defaults ??= loadTemplates();
	return defaults;
}

export function renderDocument(
	templates: Templates,
	page: PageFrontmatter,
	body: string,
): string {
	const data: Record<string, unknown> = {
		title: page.title,
		description: page.description,
		route: page.route,
		kind: page.kind,
		body: body.trim(),
	};
	if (page.order !== undefined) data.order = page.order;

	const rendered = templates.render("page", data);
	return rendered.endsWith("\n") ? rendered : `${rendered}\n`;
}
