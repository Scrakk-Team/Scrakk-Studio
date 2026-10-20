---
title: "VS Code compatibility"
group: extensions
order: 320
summary: "How Scrakk turns a .vsix into a .sef: the 5 layers, what gets translated today and what is reported."
---
# VS Code compatibility

Scrakk can **convert** a VS Code extension (`.vsix`) into SEF and run it. It does
not execute the `.vsix`: it **translates** it into a SEF package + (if it brings
code) an Extension Host.

The pipeline lives in `shared/compatibility/vscode/` and runs when you install a
`.vsix` from **Settings → Extensions**.

## The 5 layers

1. **validate** — is it a readable `.vsix`? (ZIP, anti zip-bomb limits, valid
   `package.json`). Here there **are** limits, unlike the install of a native
   `.sef`.
2. **detectKinds** — what does it bring? Every `contributes` key is classified
   against the surface table: `supported` / `partial` / `missing`.
3. **translate** — only kinds with a translator attempt conversion. Anything
   broken is skipped with a warning; it never crashes the install.
4. **verify** — coverage = translated / detected. If **nothing** was translated →
   an honest error with the classification (an empty extension is not installed).
5. **build** — pure SEF manifest + assets. The SEF core never sees the `.vsix`.

The resulting `id` is `vscode-<publisher>.<name>` (sanitized).

## What gets translated today

| VS Code contribution point | Status | Goes to |
|---|---|---|
| `themes` | supported | `themes` |
| `iconThemes` | supported | `fileIcons` |
| `productIconThemes` | supported | `productIcons` |
| `viewsContainers` + `views` + `viewsWelcome` | supported | `views` (+ `runtime`) |
| `languages` + `grammars` | supported | `languages` |
| `main` (Node code) | supported | Extension Host (`runtime`) |
| `snippets`, `semanticTokenScopes`, `configurationDefaults` | partial | `languages` |
| `commands`, `configuration` | partial | command registry / Settings |
| `keybindings` | partial | `keybindings` (command + key; `when` is skipped) |
| `menus`, `debuggers`, `tasks`, `terminal` | no | — |
| `colors`, `icons`, `authentication`, `customEditors`, `notebooks` | no | — |
| `chat*`, `languageModel*`, `mcpServerDefinitionProviders` | no | — |
| `browser` (web extension) | no | the host does not run web extensions yet |

> The single source of this table is `shared/compatibility/surface/`. The
> `kinds.ts` table is a **projection** of it: changing a kind's status is changing
> one entry, not two truths that can drift apart.

## The translators

Each kind with a translator lives in `translators/types/<kind>/` and provides:
`detect(manifest)`, `translate(manifest, files, { extensionId })` →
`{ contributions, assets, mapped, manifestExtras }`. The registry
(`translators/registry.ts`) is the list; adding support = one entry.

Also, `analyze.ts` reads the code (`main`/`browser`) for the report of used APIs
(it does not run it) and decides `requiresNode`.

## What the user gets

On install, **Settings → Extensions** shows:

- **coverage** (`%` of translated contributions),
- a **warning** if it is partial ("Partial compatibility (N%): … what was
  translated works; the rest is ignored"),
- how many file icon / color / UI icon themes were translated,
- whether it **requires Node** (that is, whether it will run an Extension Host).

If the conversion translates **nothing**, the install **fails** with the detail of
each kind and its reason (instead of installing something empty).

## Re-translation

The package keeps a `.source.json` sidecar with the origin (`vscode`), the
coverage, the translator version and the path to the original `.vsix`. When
`COMPAT_TRANSLATOR_VERSION` goes up, on boot the old extensions are
**re-translated** (as long as the original `.vsix` still exists). If not, they are
skipped and keep working with the converter they were born with.

## Real limits

- There is **no** `menus`: a VS Code extension that depends on a context menu
  will not see it. `keybindings` do translate (command + key or chord), but
  `when` conditions are skipped: our shortcuts have no context scope yet.
- The `vscode.extensions` namespace is a **stub**: extensions cannot query each
  other.
- `applyEdit`/`TextEditor.edit` are **not** there: an extension that edits the
  buffer from code fails with a clear error. (Those using `vscode-languageclient`
  do work: that goes through the host, not the editor.)
- `browser` (web extensions) do not run.

## Next steps

- [Extension API](../reference/vscode-api.md) — the status of every member.
- [Extension Host](extension-host.md) — where the converted code runs.
