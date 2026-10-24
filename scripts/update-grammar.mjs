import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = "tree-sitter-grammars/tree-sitter-lua";
const assetName = "tree-sitter-lua.wasm";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = path.join(root, "vendor", assetName);
const recordPath = path.join(root, "vendor", "tree-sitter-lua.json");
const downloadPath = `${wasmPath}.download`;
const installedEntry = path.join(
	root,
	"node_modules/web-tree-sitter/web-tree-sitter.js",
);

const tagArg = process.argv[2];
const releaseUrl = tagArg
	? `https://api.github.com/repos/${repo}/releases/tags/${tagArg}`
	: `https://api.github.com/repos/${repo}/releases/latest`;

const headers = {
	Accept: "application/vnd.github+json",
	"User-Agent": "luals-docs",
};

const releaseRes = await fetch(releaseUrl, { headers });
if (!releaseRes.ok) {
	throw new Error(
		`Failed to read ${releaseUrl}: ${releaseRes.status} ${releaseRes.statusText}`,
	);
}
const release = await releaseRes.json();
const asset = release.assets?.find((item) => item.name === assetName);
if (!asset?.browser_download_url) {
	throw new Error(`Release ${release.tag_name} has no ${assetName} asset`);
}

console.log(`Downloading ${release.tag_name} ${assetName}`);
const wasmRes = await fetch(asset.browser_download_url, { headers });
if (!wasmRes.ok) {
	throw new Error(
		`Failed to download ${assetName}: ${wasmRes.status} ${wasmRes.statusText}`,
	);
}
writeFileSync(downloadPath, Buffer.from(await wasmRes.arrayBuffer()));

try {
	const installed = installedWebTreeSitter();
	const chosen = await findNewestRuntime(downloadPath, installed);
	if (chosen === installed) {
		console.log(
			`web-tree-sitter ${installed} is already the newest release that loads this grammar.`,
		);
	} else {
		console.log(
			`Installing web-tree-sitter ${chosen}, the newest release that loads this grammar.`,
		);
		execFileSync("pnpm", ["add", "--save-exact", `web-tree-sitter@${chosen}`], {
			cwd: root,
			stdio: "inherit",
		});
		const checked = probe(installedEntry, downloadPath);
		if (!checked.ok) {
			throw new Error(
				`web-tree-sitter ${chosen} still cannot load ${release.tag_name}. ${checked.error ?? ""}`.trim(),
			);
		}
	}

	renameSync(downloadPath, wasmPath);
	writeFileSync(
		recordPath,
		`${JSON.stringify(
			{
				repository: repo,
				tag: release.tag_name,
				asset: assetName,
				webTreeSitter: chosen,
			},
			null,
			"\t",
		)}\n`,
	);
	console.log(
		`Saved ${release.tag_name} to vendor/${assetName} (web-tree-sitter ${chosen}).`,
	);
} catch (err) {
	rmSync(downloadPath, { force: true });
	throw err;
}

function installedWebTreeSitter() {
	const pkg = JSON.parse(
		readFileSync(
			path.join(root, "node_modules/web-tree-sitter/package.json"),
			"utf8",
		),
	);
	return pkg.version;
}

async function findNewestRuntime(wasm, installed) {
	const versions = stableVersions().sort(compareVersions).reverse();
	const cache = path.join(tmpdir(), "luals-docs-web-tree-sitter");
	mkdirSync(cache, { recursive: true });
	let last = null;
	for (const version of versions) {
		const entry =
			version === installed
				? installedEntry
				: await packWebTreeSitter(version, cache);
		console.log(`Checking web-tree-sitter ${version}`);
		const result = probe(entry, wasm);
		last = result;
		if (!result.ok) continue;
		return version;
	}

	const detail = last?.abi
		? ` The grammar ABI is ${last.abi}.`
		: last?.error
			? ` ${last.error}`
			: "";
	throw new Error(
		`No published web-tree-sitter release can load ${assetName}.${detail}`,
	);
}

function stableVersions() {
	const raw = execFileSync(
		"npm",
		["view", "web-tree-sitter", "versions", "--json"],
		{ encoding: "utf8" },
	);
	const versions = JSON.parse(raw);
	return versions.filter((version) => /^\d+\.\d+\.\d+$/.test(version));
}

async function packWebTreeSitter(version, cache) {
	const dir = path.join(cache, version);
	const entry = path.join(dir, "package/web-tree-sitter.js");
	try {
		readFileSync(entry);
		return entry;
	} catch {
		// Download this version into the cache.
	}
	mkdirSync(dir, { recursive: true });
	const packed = execFileSync(
		"npm",
		["pack", `web-tree-sitter@${version}`, "--pack-destination", dir],
		{ encoding: "utf8" },
	)
		.trim()
		.split("\n")
		.pop();
	execFileSync("tar", ["-xzf", path.join(dir, packed), "-C", dir]);
	return entry;
}

function probe(entry, wasm) {
	const source = `
		import { Language, MIN_COMPATIBLE_VERSION, LANGUAGE_VERSION, Parser } from ${JSON.stringify(entry)};
		await Parser.init();
		const min = MIN_COMPATIBLE_VERSION;
		const max = LANGUAGE_VERSION;
		try {
			const language = await Language.load(${JSON.stringify(wasm)});
			const abi = language.abiVersion;
			if (abi < min || max < abi) {
				console.log(JSON.stringify({ ok: false, abi, min, max, error: "ABI " + abi + " is outside " + min + "-" + max }));
			} else {
				const parser = new Parser();
				parser.setLanguage(language);
				const tree = parser.parse("function Entity:give(name)\\nend\\n");
				const ok = Boolean(tree && !tree.rootNode.hasError);
				console.log(JSON.stringify({ ok, abi, min, max, error: ok ? null : "function declaration did not parse" }));
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const match = message.match(/Incompatible language version (\\d+)/);
			console.log(JSON.stringify({
				ok: false,
				abi: match ? Number(match[1]) : null,
				min,
				max,
				error: message.split("\\n")[0],
			}));
		}
	`;
	const output = execFileSync(
		process.execPath,
		["--input-type=module", "-e", source],
		{ encoding: "utf8" },
	);
	const line = output
		.trim()
		.split("\n")
		.findLast((item) => item.startsWith("{"));
	if (!line) {
		throw new Error(`web-tree-sitter probe returned no result:\n${output}`);
	}
	return JSON.parse(line);
}

function compareVersions(left, right) {
	const a = left.split(".").map(Number);
	const b = right.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		if (a[i] !== b[i]) return a[i] - b[i];
	}
	return 0;
}
