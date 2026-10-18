---
title: "The `.scrakk` folder"
group: features
order: 240
summary: "The user/project config folder: its files (lsp.json, permissions.json, modes.json, skills/), the jailed list/read/write/watch API, and the project-over-user precedence."
---
# The `.scrakk` folder

`.scrakk` is where Scrakk Studio keeps per-user and per-project configuration and data. There
are two layers with the **same file names**; the project layer wins over the user layer. Every
subsystem (LSP, permissions, modes, skills) reads and writes through one service instead of
building paths by hand, and the renderer never touches the filesystem directly.

## Layout and precedence

| Layer | Path | Wins over |
|---|---|---|
| User | `~/.scrakk/<file>` | — |
| Project | `<root>/.scrakk/<file>` | User, per key/id/name |

The project root is the active workspace (`scrakk-studio:root-path`); if no folder is open,
`scope: 'project'` calls fail with "no project open". The user home can be overridden with the
`SCRAKK_HOME` environment variable (used by tests/dev).

```
~/.scrakk/                         <root>/.scrakk/
├── lsp.json                       ├── lsp.json
├── permissions.json               ├── permissions.json
├── modes.json                     ├── modes.json
└── skills/<name>/SKILL.md         └── skills/<name>/SKILL.md
```

## The files

- **`lsp.json`** — language-server definitions. Parsed tolerantly, merged by server name
  (project wins). See [Server configuration](../lsp/configuration.md).
- **`permissions.json`** — allow / ask / deny rules plus `defaultMode` and per-mode rules.
  See [Modes and permissions](../chat/permissions.md).
- **`modes.json`** — custom approval modes, each starting from a built-in `base` and only
  overriding what the user touched (`{ "modes": [ { "id", "label", "base", "overrides" } ] }`);
  the project wins by mode id.
- **`skills/<name>/SKILL.md`** — Agent Skills (frontmatter `name` + `description`, then a
  markdown body). The project layer wins by skill name; extensions can also contribute skills.

`src/main/scrakkFolder.ts` owns the path math and the layered merge:

```ts
import { loadLayered } from '../scrakkFolder'

const { merged, sources } = await loadLayered<Config>(
  'lsp.json',
  projectRoot,
  (raw, key) => parseEntry(raw, key)   // null = drop the entry (with a warning)
)
// `sources[serverName]` is 'user' | 'project' after the project layer overwrote the user one
```

`readJsonLayer` returns `null` for a missing or invalid file (a broken config is not a crash);
`writeJsonLayer` creates the parent directory and writes pretty JSON with a trailing newline.

## The API

`@services/scrakk` is the renderer entry point. A handle is bound to a scope and, optionally, a
sub-folder inside it:

```ts
import { scrakkHandle, scrakkNamespace, scrakkRoots, onScrakkChanged } from '@services/scrakk'

const lsp   = scrakkHandle('project')            // <root>/.scrakk
const skills = scrakkNamespace('skills', 'project') // <root>/.scrakk/skills

await skills.list()                              // ScrakkResult<ScrakkEntry[]>
await skills.write('demo/SKILL.md', content)     // ScrakkResult<string> (absolute path written)
await skills.readJson('config.json')             // ScrakkResult<object | null>
await skills.mkdir('demo')                       // ScrakkResult<string>
await skills.remove('demo')                      // ScrakkResult<null>
await skills.exists('demo/SKILL.md')             // boolean
await skills.stat()                              // ScrakkResult<ScrakkEntry | null>
await skills.watch()                             // ScrakkResult<null>; fires scrakk:changed
const roots = await scrakkRoots()                // { user, project } absolute paths
const off = onScrakkChanged((e) => {})           // { scope, relative }
```

Every call carries a `ScrakkOp`; the renderer resolves the project root once and sends it:

```ts
interface ScrakkOp {
  scope: 'user' | 'project'
  relative?: string                 // 'skills/demo/SKILL.md', always '/'-separated
  projectRoot?: string | null       // only used for scope: 'project'
}
```

`scrakkNamespace(id, scope, dir = id)` caches handles per `scope:dir`, so several consumers of
the same folder share one. Results are uniform — `{ ok: true, data }` or `{ ok: false, error }`
— and never throw across IPC.

## The jail (main process)

The renderer talks to `api.scrakk`; the main handler (`src/main/scrakk/fs.ts` via
`src/main/scrakk/ipc.ts`) validates every relative path before touching disk:

```ts
function resolveInside(root: string, relative?: string): string | null {
  const rel = normalizeRelative(relative)     // '\' → '/', strip './', collapse '//'
  const abs = path.resolve(root, rel)
  const base = path.resolve(root)
  if (abs !== base && !abs.startsWith(base + path.sep)) return null  // escaped
  return abs
}
```

- `writeText` and `removeEntry` reject a path that resolves to the root itself
  (`relative: ''`), so a typo cannot wipe `.scrakk`; `makeDir` allows it (creating/keeping the
  root directory is a no-op).
- `listEntries` returns `[]` for a missing directory; `readText` returns `null` for a missing
  file or a directory; `readJson` returns `null` for missing or non-object JSON.
- `watchDir` is **per sender**: it debounces filesystem events by 80 ms and sends
  `scrakk:changed` `{ scope, relative }`. Watchers are disposed automatically when the
  `WebContents` is destroyed (`disposeWatchersFor`).

## Limits

- `scope: 'project'` requires an open root; without one the call fails with "no project open".
- The jail is **lexical** (`path.resolve` + prefix check): it blocks `..` and root writes, but
  it does **not** call `realpath`, so a symlink placed inside the layer is not detected.
- `readJson`/`readText` are tolerant: a corrupt file reads as `null`, not an error.
- `scrakkFolder.ts` does no schema validation of its own — each subsystem parses and drops its
  own invalid entries.
- Skill names must match `/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/`; the AI tool reports when there
  are no skills.

## Next steps

- [Server configuration](../lsp/configuration.md) — the `lsp.json` layer rules.
- [Modes and permissions](../chat/permissions.md) — `permissions.json` and `modes.json`.
- [Workspaces](workspaces.md) — the root that scopes the project layer.
