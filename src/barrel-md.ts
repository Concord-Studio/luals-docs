/** Site-root path for an API route (e.g. `/api/world`). */
export function apiHref(routeSlug: string): string {
	return `/${routeSlug}`;
}

/** Mirror `.lua` path to `.md` under the output directory (optional strip of `inputDir`). */
export function outputMdRelPath(luaRelFile: string, inputDir?: string): string {
	let normalized = luaRelFile.replace(/\\/g, "/");
	if (inputDir) {
		const prefix = `${inputDir.replace(/\\/g, "/").replace(/\/+$/, "")}/`;
		if (normalized.startsWith(prefix)) {
			normalized = normalized.slice(prefix.length);
		}
	}
	if (normalized.endsWith(".lua")) {
		return `${normalized.slice(0, -4)}.md`;
	}
	return `${normalized}.md`;
}

/** Default route from a workspace-relative Lua path. */
export function defaultRouteSlug(
	luaRelFile: string,
	routePrefix: string,
	inputDir?: string,
): string {
	let rel = luaRelFile.replace(/\\/g, "/");
	if (rel.endsWith(".lua")) rel = rel.slice(0, -4);
	if (inputDir) {
		const prefix = `${inputDir.replace(/\\/g, "/").replace(/\/+$/, "")}/`;
		if (rel.startsWith(prefix)) {
			rel = rel.slice(prefix.length);
		}
	}
	rel = rel.replace(/^\/+/, "");
	if (rel === "init") return routePrefix;
	if (rel.endsWith("/init")) {
		rel = rel.slice(0, -"/init".length);
	}
	if (!rel) return routePrefix;
	return `${routePrefix}/${rel}`;
}

/** Heading id (e.g. `SystemClass` → `systemclass`). */
export function anchor(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** URL segment for a method name (e.g. `give` → `give`, `shallowCopy` → `shallow-copy`). */
export function memberSlug(memberName: string): string {
	return slugify(memberName);
}

export function memberRouteSlug(
	pageRouteSlug: string,
	memberName: string,
): string {
	return `${pageRouteSlug}/${memberSlug(memberName)}`;
}

/** Child page path next to the hub `.md` (e.g. `entity.md` → `entity/give.md`). */
export function memberOutputRelPath(
	parentOutputRelPath: string,
	memberName: string,
): string {
	const base = parentOutputRelPath.replace(/\.md$/i, "");
	return `${base}/${memberSlug(memberName)}.md`;
}

export function typeRouteSlug(pageRouteSlug: string, typeName: string): string {
	return memberRouteSlug(pageRouteSlug, typeName);
}

export function typeOutputRelPath(
	parentOutputRelPath: string,
	typeName: string,
): string {
	return memberOutputRelPath(parentOutputRelPath, typeName);
}

export function memberDisplayLabel(
	owner: string,
	member: { name: string; callSeparator: ":" | "." },
): string {
	return `${owner}${member.callSeparator}${member.name}`;
}

/** Kebab slug for filenames or labels when a readable slug is needed. */
export function slugify(name: string): string {
	return name
		.replace(/([a-z])([A-Z])/g, "$1-$2")
		.replace(/[^a-zA-Z0-9]+/g, "-")
		.toLowerCase()
		.replace(/^-|-$/g, "");
}

/** Lua `require` module id (`lib/utils.lua` → `lib.utils`). */
export function luaRequireModuleId(luaRelFile: string): string {
	let rel = luaRelFile.replace(/\\/g, "/");
	if (rel.endsWith(".lua")) rel = rel.slice(0, -4);
	rel = rel.replace(/^\/+/, "");
	if (rel.endsWith("/init")) {
		rel = rel.slice(0, -"/init".length);
	} else if (rel === "init") {
		rel = "";
	}
	return rel.replace(/\//g, ".");
}
