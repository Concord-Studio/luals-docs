# luals-docs

Generates API Markdown from Lua `---` doc comments and `---@docs` directives (same annotations you use with [Lua Language Server](https://luals.github.io/) in the editor).

## Configuration

Place `.luals-docs.json` at the repository root. The CLI walks upward from the current working directory until it finds that file.

| Field | Purpose |
| ------- | --------- |
| **`inputDir`** | Library root. All `.lua` files under it are scanned recursively; a file is documented when it has `---@docs kind` (use `---@docs off` to exclude). |
| **`sidebar`** | Groups links on the `---@docs index` page by `@docs kind`. |
| **`outputDir`** | Where `.md` files are written. |
| **`routePrefix`** | First URL segment for automatic routes (default `api`). |
| **`indexJson`** | Optional path for the documentation index JSON (see below). |
| **`templatesDir`** | Nunjucks templates for the page layout. Defaults to the built-in set in `templates/`. A directory here overrides only the files it contains. |

Page **description** comes from the file’s leading summary comment (first prose line in the `---` block).

## Templates

Page layout comes from [Nunjucks](https://mozilla.github.io/nunjucks/) files. [TEMPLATES.md](TEMPLATES.md) lists every file, the values it receives, and the `yaml`, `renderMarkdown`, and `renderInline` helpers. Set `templatesDir` to a directory that contains only the templates you want to replace. Missing files stay on the built-in versions.

## Per-file `---@docs` directives

| Directive | Purpose |
| ----------- | --------- |
| `@docs off` | Skip Markdown for this file |
| `@docs kind <name>` | **Required** on every documented file. `name` must be listed in a config `sidebar` group (for example `module` or `class`). |
| `@docs slug <path>` | Route override (default: path under `inputDir`, e.g. `api/world`) |
| `@docs index` | Folder barrel: lists siblings in the same directory; each immediate subfolder is either one nested index (if that folder has its own `@docs index`) or all documented pages under that subfolder. One index per folder. |
| `@docs order <n>` | Sort order in the index JSON and the page template variable `order` (index entry defaults to `0`). |
| `@docs title <name>` | Frontmatter title override |

## Setup

```bash
cd luals-docs
pnpm install
pnpm build
```

Install the CLI from npm:

```bash
npm install -g @concord.studio/luals-docs
```

From a checkout of this repository, `pnpm install-local` builds the package, packs it, and installs that tarball globally. The binary is placed in `PNPM_HOME` when that variable is set, and next to the current `node` binary otherwise, so `luals-docs` is on your PATH. The installed files are the same ones an npm install would get.

Publishing runs from [`.github/workflows/publish.yml`](.github/workflows/publish.yml) when a GitHub Release is published. Tag the release `v` plus the version in `package.json` (a `2.0.0` package needs the tag `v2.0.0`). That workflow is what stages the package on npm, using [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) and [staged publishing](https://docs.npmjs.com/staged-publishing/). Approve the staged version with two-factor authentication, on npm’s Staged Packages tab or with `npm stage approve`, before it can be installed.

On the package’s Settings → Trusted publishing page, add GitHub Actions with organization `Concord-Studio`, repository `luals-docs`, and workflow filename `publish.yml`. Leave the environment blank, and leave direct `npm publish` turned off. Publish the release within two days of saving a new trusted publisher, then approve the staged package. After that stage succeeds, set the package’s publishing access to require two-factor authentication and disallow tokens.

## Command

```bash
luals-docs
luals-docs --help
```

From this package, `pnpm docs` builds and runs the CLI. It reads the configured Lua sources, writes Markdown under `outputDir`, and deletes stale `.md` files that this run did not produce. On success it prints how many files were written and where.

```text
luals-docs [build] [options]

  -c, --config <file>    Path to .luals-docs.json (default: search parent directories)
  -o, --out <dir>        Markdown output directory (overrides outputDir)
  --index-json <file>   Index JSON path (overrides indexJson)
  -h, --help
  -v, --version
```

`build` is optional (`luals-docs build` does the same thing). `--out` and `--index-json` are the overrides to use when CI writes into another repository. Values can be written as `--out <dir>` or `--out=<dir>`.

### Index JSON (optional)

When `indexJson` is set, the generator writes a JSON index of the documented pages:

```json
[
  { "title": "API", "route": "api" },
  {
    "label": "Classes",
    "items": [
      { "title": "Entity", "route": "api/entity" },
      { "title": "World", "route": "api/world" }
    ]
  }
]
```

Structure:

1. A `{ title, route }` entry for each root `@docs index` page.
2. A `{ label, items }` group for each nested `@docs index`, then one for each config `sidebar` kind group.
3. Index pages are not repeated inside kind groups. Member and type pages are omitted.

`route` matches the page’s `route` frontmatter. `title` is `---@docs title` or the inferred name. Nested index group labels use the `sidebar` config when the pages in that folder fit one kind group. Order uses `---@docs order`, then discovery order.

## Hub and method pages

Each documented `.lua` file becomes a **hub** page (`/api/entity`, `/api/world`, …): **Require**, the primary exported **`@class`** (same name as the module, e.g. `World` on the World page), a **Methods** table, and a **Types** table for other types in that file.

Each documented function/method gets its own **leaf** page at `/api/{module}/{method}` (e.g. `/api/entity/give`). **Auxiliary** `@class` / `@alias` definitions get leaves at `/api/{module}/{type-name}` (e.g. `/api/world/filter-definition`); the module’s own export type stays on the hub. Leaf pages are left out of the index JSON. Each leaf starts with a link back to its hub (`← World`).

`@see` tags and the generated symbol index resolve to leaf URLs, not `#anchors` on the hub.

## Overloads in Lua comments

Shared prose before `@` tags, then `@overload` lines with following prose, then `@param` / `@return`.

On **method leaf** pages, multiple overloads render as repeated blocks: a `### \`usage line\`` heading, signature fence, **#### Arguments** / **#### Returns** per overload. Shared summary/description (before `@overload`) is shown once with the first overload only.

## Usage examples (`@usage`)

Document how to call an API with real Lua (not just the auto-generated signature line):

**Block comment** (best for multi-line snippets), placed directly above the function (after the `---` doc block is fine):

```lua
--[[@usage
Concord.Component("position", function (component, x, y)
  component.x = x or 0
end)
world:newEntity():give("position", 10, 20)
]]
--- Gives an Entity a Component.
---@param name string
function Entity:give(name, ...)
end
```

**Doc tag** — one line:

```lua
---@usage entity:ensure("position", 0, 0)
```

**Doc tag** — multiple lines until the next `@` tag:

```lua
---@usage
--- Concord.Component("position", function (c, x, y) c.x = x end)
--- entity:give("position", 1, 2)
---@param name string
```

Output renders one **Usage** section after the signature line and **Arguments** / **Returns** tables. Multiple `@usage` tags or block comments on the same method appear in **source order**, each in its own Lua code fence under that single heading.

## Types and cross-links

The hub **Types** table lists auxiliary `@class` / `@alias` entries from the file preamble. The primary export is documented under **`## ClassName`** on the hub; other types use hidden leaf pages.

On a type leaf:

- **Classes** show summary text, optional `extends`, and field tables grouped by [LuaLS field scope](https://luals.github.io/wiki/annotations/#field): public (**Fields**), **Private fields**, **Protected fields**, and **Package fields** when present.
- **Aliases** show summary text and the alias definition in a Lua code fence.

Type names in **Arguments** / **Returns** and field tables link to the hub (`/api/world#world`) or a type leaf (`/api/world/filter-definition`) when documented.

Mark field visibility in Lua with scoped `@field` lines, for example:

```lua
---@class Entity
---@field private __world? World
---@field has fun(self: Entity, name: string): boolean
```

Keep the file preamble as one continuous block of `---` comments (blank lines between comment blocks are allowed). Put `---@docs kind` before the primary `@class` for that page.
