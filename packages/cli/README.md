# @scrakk-official/cli

Authoring CLI for **Scrakk Studio** extensions (SEF packages): scaffold, bundle,
pack and validate.

Published to npm as [`@scrakk-official/cli`](https://www.npmjs.com/package/@scrakk-official/cli);
the binary it installs is **`sef`**.

## Install

```sh
npm install -g @scrakk-official/cli      # global
npx @scrakk-official/cli build ./ext     # on demand
```

Offline / no-registry fallback (installs the tarball attached to the latest
GitHub Release):

```sh
curl -fsSL https://raw.githubusercontent.com/Scrakk-Team/Scrakk-Studio/master/packages/cli/install.sh | bash
```

## Usage

```sh
sef create   "<name>" [dir]   # scaffold with a sample panel
sef build    <dir>            # bundle → dist/modules.js
sef pack     <dir>            # validate and write <dir>.sef
sef validate <dir>            # validate only
sef --help
sef --version
```

### `create`

Computes the `id` from the name (lowercased; anything outside `[a-z0-9._-]`
becomes `-`, accents are lost — use ASCII) and writes `<dir>/<id>/` with a
`manifest.json` and a sample `panels/Panel.tsx`.

### `build`

Generates a **virtual entry** from the manifest (nothing hardcoded) and
compiles it with `esbuild` (`format: esm`, `jsx: automatic`,
`platform: browser`, `external: ['react','react-dom']`) to `dist/modules.js`,
which exports:

```js
export const modules = { "panels/Panel.tsx": Panel /* … */ }
```

Collected paths: `panels[].component`, `activityBar[].icon`,
`centerTabs[].component` and `centerTabs[].icon`.

### `pack`

Validates first; on errors it does not pack. Zips the manifest + `dist/` + the
data folders (`themes/`, `icons/`, `productIcons/`, `lsp/`) into
`<packageRoot>.sef` (next to the package folder).

### `validate`

Checks (mirroring the core's runtime rules): `id` matches
`^[a-z0-9][a-z0-9._-]*$`; `name` not empty; `version` semver; `engine` a string;
`runtime` a `{ entry: string }`; `permissions` in the catalogue; `contributes`
exists with only known kinds; every referenced code path exists; themes/icons
without `path` have their conventional file.

## Development

```sh
npm install
npm run typecheck
npm run build      # bundles src/ → dist/index.js
node dist/index.js --help
```

Layout: `src/config.ts` (conventions), `src/schema.ts` (validation),
`src/api.ts` (create/build/pack), `src/index.ts` (CLI surface),
`src/version.ts` (semver-lite helper).

## Publishing

Releases are published from CI by tag (`cli-v*`) via **npm Trusted Publishing**
(OIDC — no token stored). See `.github/workflows/publish-cli.yml`. Configure the
trusted publisher once on npmjs (package → Settings → Trusted Publisher):
repository `Scrakk-Team/Scrakk-Studio`, workflow `publish-cli.yml`.

The same workflow attaches `cli.tgz` + `install.sh` to the GitHub Release as a
registry-free fallback.

## License

Apache-2.0. See [LICENSE](./LICENSE).
