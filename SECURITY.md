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
loopback/metadata, extension archives are bounded, and the backend
market/Storage/consent policies were corrected (migrations `0031`/`0032`).

## Residual risks (known)

1. **Renderer ↔ main bridge.** `window.api` exposes filesystem reads/writes and
   `fs:exec-command`. This is required by the editor and the agent, but it means
   any future XSS or an extension bundle running in the renderer can execute
   commands. The real fix is moving extension UI bundles to an isolated origin
   and narrowing the bridge.
2. **Extension host sandbox.** Extensions can `require('child_process')` and
   `fs`. Node's permission model / a VM boundary is not enabled.
3. **Unsigned builds.** Authenticode/notarization are not configured; the
   updater relies on the GitHub feed. Electron fuses are enabled, but code
   signing is still required to make `EnableEmbeddedAsarIntegrityValidation`
   effective.
4. **`safeStorage` without a keyring.** On Linux without libsecret, Chromium
   falls back to `basic_text`. Account tokens **and provider API keys** are not
   persisted in that case (fail-closed): they live in memory for the session.
   Install GNOME Keyring/KWallet if you need persistence.
5. **OTP limits are local.** The client now has a cooldown/quota, but the auth
   API (`api.scrakk.art`) must enforce its own per-email/IP rate limit; that
   code is not in this repository.
6. **Secrets rotation is an operational step.** The audit removed the archive
   and fixed the ignore rules, but the `service_role`, R2 and DeepL credentials
   that existed before 0.1.5 must be **rotated** in their dashboards; the old
   values are compromised by definition.

## Secret rotation checklist

1. Supabase → Project Settings → API → rotate the JWT signing secret and update
   `tools/admin/.env` (never commit it).
2. Cloudflare R2 → create per-bucket tokens (`PutObject` only for the image
   buckets), update `.env` and the Supabase Vault (`get_r2_config`).
3. DeepL → revoke the `:fx` key and create a new one.
4. If any of those values were ever pushed, assume the repository's history is
   compromised and rotate again after cleaning.
