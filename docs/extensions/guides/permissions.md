---
title: "Permissions"
group: extensions
order: 160
summary: "The deny-by-default permission model and the path jail that protects your machine from an extension."
---
# Permissions

The model is **deny-by-default**: an extension can only do what it **declares** in
its manifest, and **even then** the filesystem is jailed. Enforcement runs in the
**main** process; the extension host does not touch disk directly.

```json
{ "permissions": ["fs.read", "network.fetch"] }
```

## The catalogue

| Permission | What it enables |
|---|---|
| `fs.read` | Read files in the workspace |
| `fs.write` | Write/create files in the workspace |
| `fs.all` | The whole disk (dangerous; requested explicitly) |
| `shell.exec` | Run commands on your machine (dangerous) |
| `network.fetch` | Outgoing HTTP requests |
| `lsp.use` | Query the LSP runtime |

A permission outside the catalogue makes `sef validate` fail.

## The path jail

Even with `fs.read`/`fs.write`, every access goes through `checkPathAccess`:

1. **Unknown extension** (no readable manifest) → total deny (fail-closed).
2. **Sensitive paths** → blocked **always**, even with `fs.all`: `~/.ssh`,
   `~/.aws`, `~/.gcloud`, `~/.kube`, `~/.gnupg`, `*.pem`, `*.key`, `id_rsa`,
   `id_ed25519`, `.netrc`.
3. **Specific permission** required (`fs.read` or `fs.write`); `fs.all` covers
   them.
4. **`fs.all`** → allows outside the workspace (but never the sensitive paths).
5. **The extension's own directories** (`globalStorage`, `workspaceStorage`,
   `logs`) → always allowed.
6. **Jail** → any other path must be **inside a root of the open workspace**;
   otherwise it is denied (`path outside the workspace`).

Rename/copy validates the **source** (read) and the **destination** (write)
separately: without that, a `rename` could move a file out of the workspace.

### How containment is decided

Both the requested path and the workspace roots are **normalised before they are
compared** — separators collapsed, `.` and `..` resolved, trailing slash dropped.
This matters: comparing the *raw* path with `startsWith` would accept
`<workspace>/../../etc/passwd`, because that string still begins with the
workspace root. A path is inside a root only if, once resolved, it is the root
itself or sits under `<root>/`. Relative paths are never inside an absolute root,
so the check stays fail-closed. A NUL byte is rejected outright.

### Known limits

Normalisation is **lexical**. It closes `..` traversal but does not follow
symlinks, so a symlink *inside* the workspace that points outside it is still a
way out. Closing that needs `fs.realpath` on the main-process side and is tracked
as follow-up work.

## Implementation note

`checkPathAccess` is pure and lives in `shared/`, so it cannot use `node:path`
(the renderer imports it). `normalizeFsPath` reproduces `path.resolve`'s lexical
semantics by hand; keep the two in sync if either changes.

## What the extension sees

- The `workspace.fs` API (readFile/writeFile/stat/readDirectory/createDirectory/
  delete/rename/copy) goes through scoped `ext:fs-*` channels that validate
  `{ extensionId, path }` against the installed manifest before touching disk.
- The paths the extension asks for are **never** returned without going through
  the jail, not even in `workspace.findFiles` (the main walks the tree and filters
  every path).
- Its own storage (`context.globalStorageUri`, etc.) belongs to the extension: it
  exists so it can save state without requesting `fs.all`.

## Notes

- `permissions` is a **declaration** for the user and the jail; there is no
  per-permission prompt yet (the UI shows what was declared).
- The **host** runs under Node's `--permission` model: no arbitrary filesystem
  and no `child_process` unless the manifest declares `fs.read`/`fs.write`/
  `shell.exec`. Network is still unrestricted, and UI bundles still run in the
  renderer (they can call `window.api` until they are migrated to webviews).
  Signed packages pin the publisher key, but a malicious publisher can still
  sign malware.
- The absence of `permissions` means **no** disk access through the mediated API
  (deny).
- `lsp.use` is gated at the point of **using** `ctx.api.lsp`: without the
  permission, it throws `PermissionError` on the first call.

## Next steps

- [Extension Host](../architecture/extension-host.md) — who authorizes.
- [Extension API](../reference/vscode-api.md) — `workspace.fs`.
