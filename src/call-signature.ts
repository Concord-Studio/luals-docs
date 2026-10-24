import type { ParsedMember, ParsedOverload } from "./parse-source.js";

export interface DocParam {
	name: string;
	types: string;
	desc: string;
}

export interface CallVariant {
	usage: string;
	/** Prose from `---` lines immediately after the matching `@overload`. */
	description?: string;
	params: DocParam[];
	returns: DocParam[];
}

interface FunParam {
	name: string;
	type: string;
	optional: boolean;
}

function splitTopLevelCommas(s: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < s.length; i++) {
		const c = s.charAt(i);
		if (c === "(") depth++;
		else if (c === ")") depth--;
		else if (c === "," && depth === 0) {
			parts.push(s.slice(start, i).trim());
			start = i + 1;
		}
	}
	parts.push(s.slice(start).trim());
	return parts.filter(Boolean);
}

function parseFunOverload(
	rest: string,
): { params: FunParam[]; ret: string } | null {
	const trimmed = rest.trim();
	const open = trimmed.indexOf("(");
	const close = trimmed.lastIndexOf(")");
	if (!trimmed.startsWith("fun") || open < 0 || close <= open) return null;

	const paramsStr = trimmed.slice(open + 1, close).trim();
	const after = trimmed.slice(close + 1).trim();
	const retMatch = after.match(/^:\s*(.+)$/);
	const ret = retMatch?.[1]?.trim() ?? "nil";

	const params: FunParam[] = [];
	for (const part of splitTopLevelCommas(paramsStr)) {
		const m = part.match(/^(\w+)(\??)\s*:\s*(.+)$/);
		if (m?.[1]) {
			const type = m[3]?.trim() ?? "";
			params.push({
				name: m[1],
				type,
				optional: m[2] === "?" || type.endsWith("?"),
			});
		}
	}
	return { params, ret };
}

function parseLuaFunctionSignature(
	signature: string,
): { call: string; argNames: string[] } | null {
	const m = signature.match(/^function\s+([\w.:]+)\s*\(([^)]*)\)/);
	if (!m) return null;
	const fn = m[1];
	if (fn === undefined) return null;
	const args = m[2]?.trim();
	const call = fn.replace(/^([A-Z]\w*):/, (_, cls) => {
		return `${cls.charAt(0).toLowerCase() + cls.slice(1)}:`;
	});
	const argNames = args ? splitTopLevelCommas(args) : [];
	return { call, argNames };
}

function returnVarName(ret: string, call: string): string | null {
	const t = ret.trim();
	if (!t || t === "nil" || t === "void") return null;
	if (t.includes("|")) return null;

	const receiver = call.match(/^([A-Za-z_]\w*):/)?.[1];
	if (receiver && receiver.toLowerCase() === t.toLowerCase()) return null;

	if (t === "table") return "result";
	const simple = t.replace(/[^a-zA-Z0-9]/g, "");
	if (!simple) return null;
	return simple.charAt(0).toLowerCase() + simple.slice(1);
}

function formatUsage(call: string, argExprs: string[], ret?: string): string {
	const args = argExprs.filter((a) => a.length > 0);
	const invocation =
		args.length > 0 ? `${call}( ${args.join(", ")} )` : `${call}()`;
	const retName = ret ? returnVarName(ret, call) : null;
	if (retName) return `${retName} = ${invocation}`;
	return invocation;
}

function returnDesc(member: ParsedMember, retType: string): string {
	for (const r of member.returns) {
		if (
			r.types.includes(retType) ||
			retType.includes(r.types.split("|")[0] ?? "")
		) {
			return r.desc;
		}
	}
	return member.returns[0]?.desc ?? "";
}

function buildPrimaryVariant(
	call: string,
	argNames: string[],
	member: ParsedMember,
): CallVariant {
	const params: DocParam[] = member.params.map((p) => ({
		name: p.name,
		types: p.types,
		desc: p.desc,
	}));

	const argExprs = argNames.map((name) => (name === "..." ? "..." : name));

	const retType = member.returns[0]?.types;
	const usage = formatUsage(
		call,
		argExprs,
		retType && !retType.includes("|") && !retType.includes("nil")
			? retType
			: undefined,
	);

	const returns: DocParam[] = member.returns
		.filter((r) => r.types && !/^nil$/i.test(r.types.trim()))
		.map((r) => ({
			name: r.name || returnVarName(r.types, call) || "",
			types: r.types,
			desc: r.desc,
		}))
		.filter((r) => r.types !== "any");

	return { usage, params, returns };
}

function includePrimaryWithOverloads(
	argNames: string[],
	overloads: ParsedOverload[],
): boolean {
	const primaryArity = argNames.length;
	const hasRest = argNames.includes("...");
	for (const ov of overloads) {
		const parsed = parseFunOverload(ov.signature);
		if (!parsed) continue;
		const ovArity = parsed.params.filter((p) => p.name !== "self").length;
		if (hasRest || primaryArity > ovArity) return true;
	}
	return false;
}

function buildOverloadVariant(
	call: string,
	overload: ParsedOverload,
	member: ParsedMember,
): CallVariant | null {
	const parsed = parseFunOverload(overload.signature);
	if (!parsed) return null;

	const params: DocParam[] = parsed.params
		.filter((p) => p.name !== "self")
		.map((p) => ({
			name: p.optional ? `${p.name}?` : p.name,
			types: p.optional && !p.type.endsWith("?") ? `${p.type}?` : p.type,
			desc: member.params.find((doc) => doc.name === p.name)?.desc ?? "",
		}));

	const argExprs = parsed.params
		.filter((p) => p.name !== "self")
		.map((p) => p.name);

	const usage = formatUsage(call, argExprs, parsed.ret);

	const retName = returnVarName(parsed.ret, call);
	const returns: DocParam[] =
		retName && parsed.ret !== "nil"
			? [
					{
						name: retName,
						types: parsed.ret,
						desc: returnDesc(member, parsed.ret),
					},
				]
			: [];

	return {
		usage,
		description: overload.description.trim() || undefined,
		params,
		returns,
	};
}

/** One usage line per overload, with its own argument and return tables. */
export function memberCallVariants(member: ParsedMember): CallVariant[] {
	const parsed = parseLuaFunctionSignature(member.signature);
	if (!parsed) {
		return [
			{
				usage: member.signature,
				params: member.params,
				returns: member.returns.map((r) => ({
					name: r.name,
					types: r.types,
					desc: r.desc,
				})),
			},
		];
	}

	const variants: CallVariant[] = [];

	if (member.overloads.length === 0) {
		variants.push(buildPrimaryVariant(parsed.call, parsed.argNames, member));
	} else {
		if (includePrimaryWithOverloads(parsed.argNames, member.overloads)) {
			variants.push(buildPrimaryVariant(parsed.call, parsed.argNames, member));
		}
		for (const ov of member.overloads) {
			const v = buildOverloadVariant(parsed.call, ov, member);
			if (v && !variants.some((x) => x.usage === v.usage)) {
				variants.push(v);
			}
		}
	}

	return variants;
}
