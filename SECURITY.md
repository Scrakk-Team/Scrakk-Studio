# Security

Scrakk Studio is a desktop IDE: it runs with the privileges of the user and it
loads third-party extensions. This file documents the threat model, what the
0.1.5 audit hardened, and the residual risks that are **known and accepted**
until the architecture changes.

## Reporting

Email `founder@scrakk.art` with a description and reproduction steps. Do not
open a public issue for a vulnerability. Please give us a reasonable window to
ship a fix before disclosure.

## Trust model (what is trusted)

- **The app itself** (`src/**`) is trusted.
- **Extensions are trusted code once installed.** The extension host is a Node
  process without a sandbox, and UI bundles are imported into the renderer.
  The `permissions` array is informative: it is **not** a security boundary.
  That is why 0.1.5 adds an explicit consent dialog before installing anything
  that runs code, and why automatic extension updates are opt-in
  (`SCRAKK_AUTO_UPDATE_EXTENSIONS=1`).
- **A workspace is not trusted.** Anything that comes from a repository
  (`.scrakk/lsp.json`, `.git/hooks`, symlinks, `node_modules/.bin`) is treated as
  untrusted until the user accepts the Workspace Trust dialog.
- **The renderer is not a security boundary.** It talks to the main process
  through a broad preload (`window.api`). A cross-site scripting bug in the
  renderer is equivalent to code execution; the audit removed the known XSS
  sinks (extension SVG icons, markdown, navigation to `file://`), but new
  renderer bugs must be treated as critical.

## Hardened in 0.1.5

See `docs/changelog/changelog-0.1.5.md` → **Security (audit)**. In short:
secrets are out of the renderer, child processes do not inherit them, the
filesystem jails resolve symlinks, project LSP configs require consent, git
refs cannot inject options, `web_fetch` pins DNS and cannot reach
loopback/metadata, extension archives are bounded, `.sef` packages can be
signed with Ed25519 (and auto-updates require a valid signature), and the
backend market/Storage/consent policies were corrected (migrations
`0031`/`0032`).

## Residual risks (known)

1. **The host sandbox covers fs and child_process; network isolation is
   Linux-only.** The Extension Host runs with Node's `--permission` model: it
   cannot read arbitrary files or spawn processes unless the manifest declares
   `fs.read`/`fs.write`/`shell.exec`. On Linux, an extension without
   `network.fetch` is also wrapped in `bwrap --unshare-net`. Windows/macOS have
   no equivalent wrapper yet, so their network is still controlled only by the
   manifest contract. `runAsNode` is enabled in the fuses
   because it is required to launch the sandboxed host as Node; an attacker who
   can launch the binary with environment variables can use it as a Node
   interpreter, but they already have code execution as the user.
2. **Installed panels are isolated; `activityBar`/`centerTabs` are not.** Panel
   bundles run in an `scrakk-ext://` iframe with their own React runtime.
   `activityBar`/`centerTabs` and packages with `"ui": { "legacyBundle": true }`
   still run in the IDE origin (no `window.api`, but DOM access).
3. **Signed packages still run trusted code.** The Ed25519 signature proves
   the package came from the pinned publisher key and was not altered; it does
   not sandbox the extension. A malicious publisher can sign malicious code.
   Keep the install consent, and only install authors you trust.
4. **The renderer still holds a broad IPC bridge.** `services/api.ts` captures
   `WindowApi` at boot (filesystem, terminal, git, llm). It is not global
   anymore, so extension bundles cannot reach it, but any XSS in the app's own
   modules runs with that capability. Narrowing the bridge remains the
   long-term fix.
5. **Unsigned app builds.** Authenticode/notarization are not configured; the
   updater relies on the GitHub feed. Electron fuses are enabled, but code
   signing is still required to make `EnableEmbeddedAsarIntegrityValidation`
   effective.
6. **`safeStorage` without a keyring.** On Linux without libsecret, Chromium
   falls back to `basic_text`. Account tokens **and provider API keys** are not
   persisted in that case (fail-closed): they live in memory for the session.
   Install GNOME Keyring/KWallet if you need persistence.
7. **OTP limits are local.** The client now has a cooldown/quota, but the auth
   API (`api.scrakk.art`) must enforce its own per-email/IP rate limit; that
   code is not in this repository.
