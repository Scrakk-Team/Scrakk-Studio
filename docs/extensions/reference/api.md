---
title: "Scrakk API"
group: extensions
order: 235
summary: "The API an extension gets: files, language servers, tooltips, notifications, the chrome radius, palette commands and AI tools."
---
# Extension API

Extensions do not import IDE internals. They talk to a small **API** that the app
builds per extension, with permissions checked on the app's side (deny by
default: nothing works unless the manifest declares it).

> **Trust model:** the host runs under Node's `--permission` model (fs access is
> limited by `fs.read`/`fs.write`; `child_process` requires `shell.exec`; native
> addons are denied). **Network is not isolated.** UI bundles run in the
> renderer but no longer receive the IPC bridge (`window.api`), so they cannot
> call `fs`/`terminal`/`git`/`llm`; they still share the DOM/origin. Signed
> packages pin the publisher key but do not turn a malicious publisher into a
> safe one.

## What a handler receives

Every contribution kind is handled by an app-side handler that receives an `api`
object:

| Member | What it does | Requires |
|---|---|---|
| `api.fs.readFile` / `api.fs.writeFile` | File access, **jailed to the workspace** (the main process enforces it) | — |
| `api.lsp.status` / `request` / `readDiagnostics` / `drainDiagnostics` / `notifyFileChanged` / `notifyFileClosed` | Language servers: navigation, diagnostics, file sync | `lsp.use` |
| `api.tooltips.show` / `hide` | Tooltips styled by the theme | — |
| `api.notifications.show` / `dismiss` | The same notification registry the app uses | — |
| `api.radius.set` / `api.radius.reset` | The **chrome corners** (see below) | — |

## Corners

`api.radius.set()` takes the same values as the theme's `radius` field:

```js
api.radius.set('rect')                 // everything square
api.radius.set('round')                // the system radii (the default)
api.radius.set({ panel: '0px' })       // per slot: panel/input/sm/xs/md/capsule
api.radius.reset()                     // give control back to the active theme
```

- The override wins over the active theme (it lands inline on `<html>`); the
  **theme defines the default** and `reset()` returns to it.
- Values are validated exactly like in the theme JSON — an extension cannot
  inject arbitrary CSS.
- A useful pattern: a panel with a button that toggles its own look
  (`api.radius.set('rect')` ⇄ `api.radius.reset()`).

The theme side of the same system (the JSON `radius` field) is documented in
[Corners](../guides/themes.md#corners).

## `window.scrakk`

A `.sef` bundle runs in the renderer, but it can only import a small set of
modules the app provides: `react`, `react-dom` (and `react-dom/client`),
`react/jsx-runtime` and `@features/layout` (the panel hooks). For everything else
there is a global the app installs at boot:

```js
window.scrakk.radius.set('rect')       // same values as api.radius.set
window.scrakk.radius.reset()
```

### Commands (the command palette)

A bundle can add its own entries to the command palette:

```js
window.scrakk.commands.register({
  id: 'clear',                         // stored as "my-extension:clear"
  title: 'Canvas: clear the board',
  category: 'Canvas',
  run: () => board.clear()
})
```

- The id is **namespaced with your extension id** (`my-extension:clear`), so two
  packages can use the same short id without stepping on each other.
- `run` is yours: it runs in the renderer, in the same module graph as your
  panel, so it can share state with it.
- Register in the **top level of a module that the manifest references** (the
  panel's, for example): the loader imports those modules when it registers the
  extension. A registration made later (inside a `setTimeout`, say) has no owner
  and is dropped with a warning.
- Uninstalling/disabling the extension removes its commands.

### AI tool handlers (extensions without code)

If your extension is **declarative** (no `runtime`/Extension Host), its tools are
answered from the bundle instead of the host:

```js
window.scrakk.tools.register('canvas.draw', (args) => {
  board.draw(args.shapes)              // args = the tool's JSON arguments
  return 'Drawn on the board.'         // string, or anything JSON-serializable
})
```

The `command` string is the one your manifest declares in
[`tools`](contributes.md#tools). With a `runtime`, the command goes to the
Extension Host instead (the VS Code model) — the app picks the path for you, and
if neither exists the tool answers with a clear error.

Nothing else is exposed there: the rest of the API is per-extension and goes
through `api` (which is the one behind the permission gate).

## Next steps

- [Contributes](contributes.md) — the kinds an extension can declare.
- [Permissions](../guides/permissions.md) — what each permission unlocks.
- [Color themes](../guides/themes.md) — the `radius` field and the rest of the theme JSON.
