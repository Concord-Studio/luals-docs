# Templates

Page layout is a set of [Nunjucks](https://mozilla.github.io/nunjucks/) files. The files in [`templates/`](templates/) are the built-in layout. To change part of it, put only the files you want to replace in another directory and point `.luals-docs.json` at that directory:

```json
{
  "templatesDir": "docs-templates"
}
```

`templatesDir` is relative to the workspace root. That is the directory containing `.luals-docs.json`, unless `workspaceRoot` is set. A file in that directory replaces the built-in file of the same name. Every other template stays on the built-in version, including files pulled in with `{% include %}`. The directory itself has to exist. A template that is missing from both directories stops the build with the file name.

The environment uses `trimBlocks` and `lstripBlocks`, and it does not HTML-escape values. A newline directly after `{% %}` is removed. A line that ends in `{% endif %}` loses its trailing newline, so list items in [`index.njk`](templates/index.njk) and [`see.njk`](templates/see.njk) are built as one string.

## How a page is assembled

Each output file is `page.njk`. It includes `frontmatter.njk`, then prints `body`.

`body` depends on `kind`:

| `kind` | Body template | When |
| --- | --- | --- |
| `hub` | `hub.njk` | One documented `.lua` file |
| `member` | `member.njk` | One function or method |
| `type` | `type.njk` | One auxiliary `@class` or `@alias` |

`hub.njk` includes `require.njk`, `methods.njk`, and `types.njk`. `primary` and `index` are already rendered strings (`primary.njk` and `index.njk`). Include those two from the hub only by printing `{{ primary }}` and `{{ index }}`. Their variables are not on the hub context.

`primary.njk` and `type.njk` include `type-body.njk`. `member.njk` includes `see.njk`.

## Helpers

| Call | Result |
| --- | --- |
| `{{ title \| yaml }}` | JSON string, safe as a YAML value |
| `{{ renderMarkdown(text) }}` | HTML block. A single paragraph is wrapped in `<p>` |
| `{{ renderInline(text) }}` | HTML for one line: links, code, emphasis. No wrapping `<p>` |

Both Markdown helpers are also filters (`{{ text \| renderInline }}`). The HTML they return is marked safe.

Type strings, the `base` class line, and table descriptions are already Markdown. `[World](/api/world#world)` is a link, and a pipe that would break a Markdown table is written `\|`. An HTML template can pass those fields through `renderInline`. `renderInline` turns `\|` back into `|`.

## `page.njk` and `frontmatter.njk`

| Variable | Present | Meaning |
| --- | --- | --- |
| `title` | always | Page title, plain text |
| `description` | always | Summary line, plain text |
| `route` | always | URL path without a leading slash, such as `api/world/give` |
| `kind` | always | `hub`, `member`, or `type` |
| `order` | hubs | `@docs order`, or `0` for an index page. Omitted on member and type pages. `0` is a real value, so test `order is defined` |
| `body` | `page.njk` only | The rendered hub, member, or type template |

The built-in frontmatter writes `title`, `description`, `route`, and `order` when `order` is defined. `route` has no leading slash.

## `hub.njk`

| Variable | Meaning |
| --- | --- |
| `bindingName` | Left-hand side of `require` |
| `moduleId` | Dotted module id, such as `lib.world` |
| `primary` | Rendered class section, or `""` |
| `methods` | Rows for `methods.njk`. Empty when the file has no documented functions |
| `types` | Rows for `types.njk`. The file's own class is omitted |
| `index` | Rendered index groups, or `""` |

`require.njk` reads `bindingName` and `moduleId`.

### Method and type rows

`methods.njk` loops `methods`. `types.njk` loops `types` as `entry`.

| Field | Method row | Type row |
| --- | --- | --- |
| Label | `label`, such as `World:emit` | `name` |
| URL | `href`, such as `/api/world/emit` | `href` |
| Summary | `blurb` | `blurb` |

`blurb` is plain text with `\|` already escaped for a Markdown table.

## `primary.njk` and `type.njk`

`type-body.njk` reads the shared fields. `primary.njk` also has `name`, the class name used as the heading. `type.njk` also has the link back to the hub.

| Variable | Meaning |
| --- | --- |
| `parentTitle`, `parentHref` | Hub title and URL. `type.njk` only |
| `summary`, `description` | Prose from the doc comment. Either may be `""` |
| `base` | Markdown link for the class this one extends, or `""` |
| `definition` | Alias body, or `""` |
| `fieldGroups` | Field tables. Empty for an alias |

Each field group:

| Field | Meaning |
| --- | --- |
| `title` | `Fields`, `Private fields`, `Protected fields`, or `Package fields` |
| `packageNote` | `true` only for the package group |
| `fields` | `{ name, types, desc }` |

`types` and `desc` are Markdown. `desc` may contain `\|`.

## `member.njk`

| Variable | Meaning |
| --- | --- |
| `parentTitle`, `parentHref` | Hub title and URL |
| `multi` | `true` when the function has more than one call variant |
| `summary`, `description` | Prose shown once. Both are `""` when `multi` is true; that prose is `variants[0].prose` instead |
| `variants` | One entry per call signature |
| `usageBlocks` | Lua source from `@usage` and `--[[@usage]]`, in source order |
| `see` | `@see` targets |

Each variant:

| Field | Meaning |
| --- | --- |
| `separator` | `true` after the first variant |
| `usage` | Call line, such as `widget:update( value )` |
| `prose` | Shared summary for the first variant of an overload set, otherwise `""` |
| `description` | Prose that followed that `@overload` |
| `argumentHeading` | `### Arguments` or `#### Arguments` |
| `arguments` | `{ name, types, desc }`. `types` and `desc` are Markdown |
| `returnHeading` | `### Returns` or `#### Returns` |
| `returns` | Same row shape. `name` may be `""` |

Each `see` item is `{ label, href }`. `href` is `""` when the target is not a documented symbol. `label` is the display form, such as `World:emit`.

## `index.njk`

Rendered only for a file with `@docs index`, then inserted into the hub as `index`.

| Variable | Meaning |
| --- | --- |
| `groups[].label` | Index group label |
| `groups[].items[].label` | Page title |
| `groups[].items[].href` | Page URL |
| `groups[].items[].blurb` | Page summary, or `""` |

## HTML pages

Replace the templates with HTML and pass Markdown fields through `renderInline` or `renderMarkdown`:

```html
<td>{{ row.types | renderInline }}</td>
<td>{{ row.desc | renderInline }}</td>
```

```html
{{ renderMarkdown(summary) }}
```

Output paths still end in `.md`. The templates control the file contents, not the file extension.
