// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * LSP — auto-instalación de servers (réplica de install.rs).
 *
 * Layout gestionado:
 *   ~/.scrakk/lsp/bin   ← binarios directos (github/custom/go con GOBIN)
 *   ~/.scrakk/lsp/npm   ← npm --prefix (bins en <dir>/bin)
 *
 * Recetas: Npm | Go | Gem | Dotnet | GitHubRelease | Custom.
 * Opt-out global: SCRAKK_DISABLE_LSP_DOWNLOAD=1.
 * Timeout de instalación lo aplica el manager (300 s, como el CLI).
 */

import { spawn } from 'child_process'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { gunzipSync } from 'node:zlib'
import { unzipSync } from 'fflate'
import type { LspInstallProgressPayload, LspServerConfig } from '@shared/lsp'
import { scrakkHome } from '../scrakkFolder'
import { resolveExecutable, spawnInvocation } from '../binaries'
import { t } from '@shared/i18n'

/**
 * Callback de progreso de instalación. No incluye `serverName`: lo agrega el
 * manager, que es quien conoce la clave de la operación.
 */
export type InstallProgress = (
  progress: Omit<LspInstallProgressPayload, 'serverName'>
) => void

export type InstallRecipe =
  | { kind: 'npm'; package: string }
  | { kind: 'go'; package: string }
  | { kind: 'gem'; package: string }
  | { kind: 'dotnet'; package: string }
  | { kind: 'github'; repo: string; assetPattern: string; binaryPath?: string }
  /** Release de GitHub con un ARCHIVO (tar/zip) de árbol completo: se extrae
   *  entero en ~/.scrakk/lsp/<command>/ y `binaryPath` queda como comando. */
  | { kind: 'githubTree'; repo: string; assetPattern: string; binaryPath?: string }
  /** Producto de HashiCorp (releases.hashicorp.com): el índice JSON del
   *  producto da la última versión y el archivo exacto para el OS/arch. */
  | { kind: 'hashicorp'; product: string; binaryPath?: string }
  | { kind: 'custom'; cmd: string[] }

export function downloadsDisabled(): boolean {
  const value = process.env.SCRAKK_DISABLE_LSP_DOWNLOAD
  return value === '1' || value === 'true'
}

export function managedBinDir(): string {
  return path.join(scrakkHome(), 'lsp', 'bin')
}

export function managedNpmDir(): string {
  return path.join(scrakkHome(), 'lsp', 'npm')
}

/** Toolchains gestionados por la app: ~/.scrakk/toolchains/<id>. */
export function managedToolchainDir(id: string): string {
  return path.join(scrakkHome(), 'toolchains', id)
}

/** Nombre de OS/arch como los usa go.dev/dl. */
function goOsName(): string {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'darwin'
  return 'linux'
}

function goArchName(): string {
  if (process.arch === 'arm64') return 'arm64'
  if (process.arch === 'ia32') return '386'
  return 'amd64'
}

/** Ruta del `go` dentro del toolchain gestionado, o `null` si no está. */
export async function managedGoPath(): Promise<string | null> {
  const bin = path.join(
    managedToolchainDir('go'),
    'go',
    'bin',
    process.platform === 'win32' ? 'go.exe' : 'go'
  )
  try {
    await fs.access(bin)
    return bin
  } catch {
    return null
  }
}

/**
 * Descarga e instala el toolchain de Go más reciente (estable) desde go.dev/dl
 * en `~/.scrakk/toolchains/go`, y devuelve la ruta del binario `go`.
 *
 * Es el prerrequisito de gopls: sin `go` no hay `go install`. Se baja el
 * tarball oficial del OS/arch actual (el JSON de go.dev dice la última versión
 * y sus archivos) y se extrae con `tar` (el tar trae la carpeta `go/`).
 */
export async function installGoToolchain(onProgress?: InstallProgress): Promise<string> {
  const existing = await managedGoPath()
  if (existing) return existing

  onProgress?.({ stage: 'resolving', message: 'go.dev/dl' })
  const response = await fetch('https://go.dev/dl/?mode=json')
  if (!response.ok) throw new Error(`go.dev/dl ${response.status}`)
  const releases = (await response.json()) as Array<{
    version: string
    stable: boolean
    files: Array<{ filename: string; os: string; arch: string; kind: string }>
  }>
  const release = releases.find((r) => r.stable) ?? releases[0]
  if (!release) throw new Error('go.dev/dl: sin releases')
  const file = release.files.find(
    (f) => f.kind === 'archive' && f.os === goOsName() && f.arch === goArchName()
  )
  if (!file) throw new Error(`sin toolchain de Go para ${goOsName()}/${goArchName()}`)

  const dest = managedToolchainDir('go')
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-go-'))
  const archivePath = path.join(tmpDir, file.filename)
  try {
    await downloadTo(`https://go.dev/dl/${file.filename}`, archivePath, onProgress)
    await fs.mkdir(dest, { recursive: true })
    onProgress?.({ stage: 'extracting', message: file.filename })
    const { code, stderr } = await run(
      resolveExecutable('tar') ?? 'tar',
      ['-xzf', archivePath, '-C', dest],
      undefined,
      (line) => onProgress?.({ stage: 'extracting', message: line })
    )
    if (code !== 0) throw new Error(`tar falló: ${stderr.slice(0, 300)}`)
    const goPath = await managedGoPath()
    if (!goPath) throw new Error('el toolchain de Go no quedó en su lugar')
    onProgress?.({ stage: 'done', message: release.version })
    return goPath
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

/** ¿Hay receta para instalar este requisito desde la app? */
export function canInstallRequirement(id: string): boolean {
  return id === 'go' || id === 'dart'
}

/** Instala un requisito del lenguaje (prerrequisito de un server). */
export async function installRequirement(id: string, onProgress?: InstallProgress): Promise<string> {
  if (id === 'go') return installGoToolchain(onProgress)
  if (id === 'dart') return installDartToolchain(onProgress)
  throw new Error(`sin receta para el requisito «${id}»`)
}

/** OS/arch como los nombra el archivo de Dart (`linux-x64`, `macos-arm64`…). */
function dartOsArch(): string {
  const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'
  const arch =
    process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? 'ia32' : 'x64'
  return `${os}-${arch}`
}

/** Ruta del `dart` dentro del SDK gestionado, o `null` si no está. */
export async function managedDartPath(): Promise<string | null> {
  const bin = path.join(
    managedToolchainDir('dart'),
    'bin',
    process.platform === 'win32' ? 'dart.exe' : 'dart'
  )
  try {
    await fs.access(bin)
    return bin
  } catch {
    return null
  }
}

/**
 * Descarga e instala el SDK de Dart más reciente (canal stable) en
 * `~/.scrakk/toolchains/dart` y devuelve la ruta del binario `dart`.
 *
 * Es el prerrequisito del server de Dart: el language server ES `dart
 * language-server`, así que sin SDK no hay server. El zip oficial trae la
 * carpeta `dart-sdk/` arriba; se extrae quitando ese prefijo.
 */
export async function installDartToolchain(onProgress?: InstallProgress): Promise<string> {
  const existing = await managedDartPath()
  if (existing) return existing

  const osArch = dartOsArch()
  const url = `https://storage.googleapis.com/dart-archive/channels/stable/release/latest/sdk/dartsdk-${osArch}-release.zip`
  const dest = managedToolchainDir('dart')
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-dart-'))
  const archivePath = path.join(tmpDir, 'dartsdk.zip')
  try {
    onProgress?.({ stage: 'resolving', message: 'storage.googleapis.com/dart-archive' })
    await downloadTo(url, archivePath, onProgress)
    await fs.mkdir(dest, { recursive: true })
    onProgress?.({ stage: 'extracting', message: 'dartsdk.zip' })
    const files = unzipSync(await fs.readFile(archivePath))
    const prefix = 'dart-sdk/'
    for (const [name, data] of Object.entries(files)) {
      if (name.endsWith('/') || !name.startsWith(prefix)) continue
      const relative = name.slice(prefix.length)
      const out = path.join(dest, relative)
      await fs.mkdir(path.dirname(out), { recursive: true })
      await fs.writeFile(out, Buffer.from(data))
      // fflate no conserva el bit de ejecutable: se repone en bin/.
      if (process.platform !== 'win32' && relative.split('/').includes('bin')) {
        await fs.chmod(out, 0o755)
      }
    }
    const dartPath = await managedDartPath()
    if (!dartPath) throw new Error('el SDK de Dart no quedó en su lugar')
    // Que los próximos spawns (el server) encuentren `dart` sin reiniciar.
    process.env.PATH = path.dirname(dartPath) + path.delimiter + (process.env.PATH ?? '')
    onProgress?.({ stage: 'done' })
    return dartPath
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

/** Layout legacy roto (npm -g --prefix): se limpia una vez. */
async function removeLegacyNpmLayout(dir: string): Promise<void> {
  const legacyLib = path.join(dir, 'lib', 'node_modules')
  try {
    await fs.access(legacyLib)
    await fs.rm(dir, { recursive: true, force: true })
  } catch {
    // no existía: nada que limpiar
  }
}

/** Garantiza package.json mínimo en el dir gestionado (npm install sin -g). */
async function ensureManagedPackageJson(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  const pkgPath = path.join(dir, 'package.json')
  try {
    await fs.access(pkgPath)
  } catch {
    await fs.writeFile(
      pkgPath,
      JSON.stringify({ name: 'scrakk-lsp-managed', private: true, version: '1.0.0' }, null, 2)
    )
  }
}

/** ¿El comando vive en los dirs gestionados? Devuelve la ruta absoluta. */
export async function resolveManagedCommand(command: string): Promise<string | null> {
  if (path.isAbsolute(command)) return null
  const candidates = [
    path.join(managedBinDir(), command),
    // npm sin -g --prefix DIR: bins en DIR/node_modules/.bin
    path.join(managedNpmDir(), 'node_modules', '.bin', command)
  ]
  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // siguiente candidato
    }
  }
  return null
}

/** Construye el argv de instalación (puro, testeable). */
export function buildInstallCommand(recipe: InstallRecipe): {
  cmd: string
  args: string[]
  env?: Record<string, string>
} {
  switch (recipe.kind) {
    case 'npm':
      // Sin -g ni --prefix: package.json mínimo en el dir gestionado +
      // install local → bins en <dir>/node_modules/.bin. (npm -g --prefix
      // está roto en npm moderno: tar corrupto hacia lib/node_modules.)
      return {
        cmd: 'npm',
        args: [
          'install',
          '--prefix',
          managedNpmDir(),
          // Los servers npm comparten un mismo dir: sin esto, un peer
          // dependency incompatible (p. ej. svelte-language-server pide
          // typescript ^5/^6 y el de typescript-language-server es 7) rompe la
          // instalación entera con ERESOLVE.
          '--legacy-peer-deps',
          '--no-audit',
          '--no-fund',
          ...recipe.package.split(/\s+/).filter(Boolean)
        ]
      }
    case 'go':
      return {
        cmd: 'go',
        args: ['install', recipe.package],
        env: { GOBIN: managedBinDir() }
      }
    case 'gem':
      return { cmd: 'gem', args: ['install', recipe.package] }
    case 'dotnet':
      return { cmd: 'dotnet', args: ['tool', 'install', '-g', recipe.package] }
    case 'custom':
      return { cmd: recipe.cmd[0], args: recipe.cmd.slice(1) }
    case 'github':
    case 'githubTree':
      // La descarga de releases no es un argv: la maneja install() directo.
      return { cmd: 'curl', args: [`https://api.github.com/repos/${recipe.repo}/releases/latest`] }
    case 'hashicorp':
      // Igual: la descarga la maneja install() (índice JSON del producto).
      return { cmd: 'curl', args: [`https://releases.hashicorp.com/${recipe.product}/index.json`] }
  }
}

/**
 * Resuelve el ejecutable de una receta contra el PATH AUMENTADO.
 *
 * Sin esto, una app abierta desde el menú no encuentra `npm` (vive en
 * `~/.nvm/…` o `~/.local/bin`, no en `/usr/bin`) y la instalación fallaba con un
 * ENOENT que se reportaba como "npm exit -1" — un mensaje que manda a buscar el
 * problema al server en vez de al PATH. Ahora se dice qué falta y dónde se buscó.
 */
function resolveCommand(cmd: string): string {
  const resolved = resolveExecutable(cmd)
  if (resolved) return resolved
  throw new Error(
    `No encontré «${cmd}» en el PATH. Instalalo, o abre la app desde una terminal, ` +
      t('main.o.pon.su.directorio.en')
  )
}

function run(
  cmd: string,
  args: string[],
  env?: Record<string, string>,
  onLine?: (line: string) => void
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    // En Windows los shims `.cmd`/`.bat` (npm, gem, …) no se pueden spawnear sin
    // shell: desde Node 18.20/20.12 tira EINVAL. `spawnInvocation` decide.
    const invocation = spawnInvocation(cmd, args)
    const child = spawn(invocation.file, invocation.args, {
      // stdout TAMBIÉN se lee: npm/go reportan el avance ahí. No se usa para
      // calcular un % (no lo dan), pero sí como texto de fase para la UI.
      stdio: ['ignore', 'pipe', 'pipe'],
      env: env ? { ...process.env, ...env } : process.env,
      shell: invocation.shell
    })
    let stderr = ''

    const forward = (chunk: string): void => {
      if (!onLine) return
      for (const raw of chunk.split('\n')) {
        const line = raw.trim()
        if (line) onLine(line)
      }
    }
    child.stdout?.setEncoding('utf-8')
    child.stdout?.on('data', (chunk: string) => forward(chunk))
    child.stderr?.setEncoding('utf-8')
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
      forward(chunk)
    })

    child.on('error', reject)
    child.on('exit', (code) => resolve({ code: code ?? -1, stderr }))
  })
}

async function fetchLatestReleaseAsset(repo: string, assetPattern: RegExp): Promise<{ name: string; url: string }> {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' }
  })
  if (!response.ok) throw new Error(`GitHub API ${response.status}`)
  const release = (await response.json()) as {
    assets?: Array<{ name: string; browser_download_url: string }>
  }
  const asset = release.assets?.find((a) => assetPattern.test(a.name))
  if (!asset) throw new Error(`sin asset que matchee ${assetPattern} en ${repo}@latest`)
  return { name: asset.name, url: asset.browser_download_url }
}

/** OS/arch como los nombra releases.hashicorp.com. */
function hashicorpOs(): string {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'darwin'
  return 'linux'
}

function hashicorpArch(): string {
  if (process.arch === 'arm64') return 'arm64'
  if (process.arch === 'ia32') return '386'
  return 'amd64'
}

/** Compara versiones tipo `1.2.10` (numérico, no alfabético). */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const pb = b.split('.').map((part) => Number.parseInt(part, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * Última versión y URL del binario de un producto de HashiCorp, leída del
 * índice JSON oficial (`releases.hashicorp.com/<product>/index.json`), que trae
 * un build por OS/arch.
 */
async function fetchHashicorpAsset(
  product: string
): Promise<{ url: string; version: string; filename: string }> {
  const response = await fetch(`https://releases.hashicorp.com/${product}/index.json`)
  if (!response.ok) throw new Error(`releases.hashicorp.com ${response.status}`)
  const index = (await response.json()) as {
    versions?: Record<
      string,
      { builds?: Array<{ os: string; arch: string; url: string; filename: string }> }
    >
  }
  const versions = Object.keys(index.versions ?? {})
    // Sin prereleases (beta/rc…): la "última" debe ser una estable.
    .filter((version) => !version.includes('-'))
    .sort(compareVersions)
  const latest = versions[versions.length - 1]
  if (!latest) throw new Error(`${product}: el índice no trae versiones`)
  const build = index.versions?.[latest]?.builds?.find(
    (candidate) => candidate.os === hashicorpOs() && candidate.arch === hashicorpArch()
  )
  if (!build) {
    throw new Error(`${product} ${latest}: sin build para ${hashicorpOs()}/${hashicorpArch()}`)
  }
  return { url: build.url, version: latest, filename: build.filename }
}

/** Extrae un archivo COMPLETO (tar/tar.gz/zip) en `destDir`. */
async function extractTree(
  archivePath: string,
  destDir: string,
  onProgress?: InstallProgress
): Promise<void> {
  onProgress?.({ stage: 'extracting', message: path.basename(archivePath) })
  if (archivePath.endsWith('.zip')) {
    const files = unzipSync(await fs.readFile(archivePath))
    for (const [name, data] of Object.entries(files)) {
      if (name.endsWith('/')) continue
      const out = path.join(destDir, name)
      await fs.mkdir(path.dirname(out), { recursive: true })
      await fs.writeFile(out, Buffer.from(data))
    }
    return
  }
  const { code, stderr } = await run(
    resolveExecutable('tar') ?? 'tar',
    ['-xf', archivePath, '-C', destDir],
    undefined,
    (line) => onProgress?.({ stage: 'extracting', message: line })
  )
  if (code !== 0) throw new Error(`tar falló: ${stderr.slice(0, 300)}`)
}

/**
 * Descarga a disco emitiendo progreso.
 *
 * Sólo aquí hay un % HONESTO: `content-length` del release. Si el server no lo
 * manda, se emite progreso indeterminado (bytes recibidos) en vez de inventar
 * un porcentaje. Se limita la frecuencia (throttle) para no saturar el IPC.
 */
export async function downloadTo(
  url: string,
  destination: string,
  onProgress?: InstallProgress
): Promise<void> {
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`download ${response.status}`)

  const total = Number(response.headers.get('content-length')) || 0
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  let lastEmit = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    chunks.push(value)
    received += value.byteLength

    const now = Date.now()
    if (total > 0) {
      if (now - lastEmit >= 100 || received >= total) {
        lastEmit = now
        onProgress?.({
          stage: 'downloading',
          percentage: Math.min(100, Math.round((received / total) * 100)),
          transferred: received,
          total
        })
      }
    } else if (now - lastEmit >= 500) {
      lastEmit = now
      onProgress?.({ stage: 'downloading', transferred: received })
    }
  }

  await fs.writeFile(destination, Buffer.concat(chunks))
  if (total > 0) {
    onProgress?.({ stage: 'downloading', percentage: 100, transferred: total, total })
  }
}

async function extractBinary(
  archivePath: string,
  binaryPathInArchive: string,
  destination: string,
  onProgress?: InstallProgress
): Promise<void> {
  await fs.mkdir(path.dirname(destination), { recursive: true })
  onProgress?.({ stage: 'extracting' })

  if (archivePath.endsWith('.gz') && !archivePath.endsWith('.tar.gz')) {
    // Binario SUELTO comprimido con gzip (ej. rust-analyzer-…-linux-gnu.gz).
    const compressed = await fs.readFile(archivePath)
    await fs.writeFile(destination, gunzipSync(compressed))
  } else if (archivePath.endsWith('.zip')) {
    const content = await fs.readFile(archivePath)
    const files = unzipSync(content)
    const wanted = Object.keys(files).find((name) => name === binaryPathInArchive || name.endsWith(binaryPathInArchive))
    if (!wanted) throw new Error(`${binaryPathInArchive} no está en el zip`)
    await fs.writeFile(destination, Buffer.from(files[wanted]))
  } else {
    // tar/tar.gz vía tar del sistema (disponible en linux/mac; win10+ tiene bsdtar).
    const tmpDir = path.join(path.dirname(archivePath), 'extracted')
    await fs.mkdir(tmpDir, { recursive: true })
    const { code, stderr } = await run(
      resolveExecutable('tar') ?? 'tar',
      ['-xf', archivePath, '-C', tmpDir],
      undefined,
      (line) => onProgress?.({ stage: 'extracting', message: line })
    )
    if (code !== 0) throw new Error(`tar falló: ${stderr.slice(0, 300)}`)
    const source = path.join(tmpDir, binaryPathInArchive)
    await fs.copyFile(source, destination)
  }

  if (process.platform !== 'win32') {
    await fs.chmod(destination, 0o755)
  }
}

/**
 * Instala según receta y devuelve el config actualizado (command apuntando al
 * binario gestionado cuando corresponde).
 */
export async function install(
  recipe: InstallRecipe,
  config: LspServerConfig,
  onProgress?: InstallProgress
): Promise<LspServerConfig> {
  onProgress?.({ stage: 'resolving' })

  // Layout legacy corrupto de npm -g --prefix: limpieza única antes de tocar npm.
  if (recipe.kind === 'npm') {
    await removeLegacyNpmLayout(managedNpmDir())
    await ensureManagedPackageJson(managedNpmDir())
  }

  switch (recipe.kind) {
    case 'npm':
    case 'gem':
    case 'dotnet': {
      const { cmd, args, env } = buildInstallCommand(recipe)
      onProgress?.({ stage: 'installing', message: `${cmd} install` })
      const { code, stderr } = await run(resolveCommand(cmd), args, env, (line) =>
        onProgress?.({ stage: 'installing', message: line })
      )
      if (code !== 0) throw new Error(`${cmd} exit ${code}: ${stderr.slice(0, 500)}`)
      const managed = await resolveManagedCommand(config.command)
      onProgress?.({ stage: 'done' })
      return managed ? { ...config, command: managed } : config
    }

    case 'go': {
      const { args, env } = buildInstallCommand(recipe)
      // gopls se instala con `go install`. Si NO hay toolchain de Go, se
      // DESCARGA el más reciente (go.dev/dl) y se usa ESE `go`.
      let goCmd = resolveExecutable('go')
      if (!goCmd) {
        goCmd = (await managedGoPath()) ?? (await installGoToolchain(onProgress))
        // Que los próximos spawns (y el propio install) encuentren `go`.
        process.env.PATH = path.dirname(goCmd) + path.delimiter + (process.env.PATH ?? '')
      }
      onProgress?.({ stage: 'installing', message: 'go install' })
      const { code, stderr } = await run(goCmd, args, env, (line) =>
        onProgress?.({ stage: 'installing', message: line })
      )
      if (code !== 0) throw new Error(`go exit ${code}: ${stderr.slice(0, 500)}`)
      const managed = await resolveManagedCommand(config.command)
      onProgress?.({ stage: 'done' })
      return managed ? { ...config, command: managed } : config
    }

    case 'custom': {
      const { cmd, args } = buildInstallCommand(recipe)
      onProgress?.({ stage: 'installing', message: `${cmd} ${args.join(' ')}` })
      const { code, stderr } = await run(resolveCommand(cmd), args, undefined, (line) =>
        onProgress?.({ stage: 'installing', message: line })
      )
      if (code !== 0) throw new Error(`custom installer exit ${code}: ${stderr.slice(0, 500)}`)
      const managed = await resolveManagedCommand(config.command)
      onProgress?.({ stage: 'done' })
      return managed ? { ...config, command: managed } : config
    }

    case 'github': {
      onProgress?.({ stage: 'downloading' })
      const asset = await fetchLatestReleaseAsset(recipe.repo, new RegExp(recipe.assetPattern))
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-lsp-'))
      const archivePath = path.join(tmpDir, asset.name)
      try {
        await downloadTo(asset.url, archivePath, onProgress)
        const binaryName = path.basename(config.command)
        const destination = path.join(managedBinDir(), binaryName)
        const inArchive = recipe.binaryPath ?? binaryName
        await extractBinary(archivePath, inArchive, destination, onProgress)
        onProgress?.({ stage: 'done' })
        return { ...config, command: destination }
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      }
    }

    case 'githubTree': {
      // Release con un ARCHIVO de árbol completo (lua-language-server, etc.):
      // se extrae entero en ~/.scrakk/lsp/<command>/ y el comando apunta ahí.
      onProgress?.({ stage: 'downloading' })
      const asset = await fetchLatestReleaseAsset(recipe.repo, new RegExp(recipe.assetPattern))
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-lsp-'))
      const archivePath = path.join(tmpDir, asset.name)
      try {
        await downloadTo(asset.url, archivePath, onProgress)
        const destDir = path.join(scrakkHome(), 'lsp', config.command)
        await fs.rm(destDir, { recursive: true, force: true })
        await fs.mkdir(destDir, { recursive: true })
        await extractTree(archivePath, destDir, onProgress)
        const binary = path.join(destDir, recipe.binaryPath ?? config.command)
        if (process.platform !== 'win32') await fs.chmod(binary, 0o755)
        onProgress?.({ stage: 'done' })
        return { ...config, command: binary }
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      }
    }

    case 'hashicorp': {
      // Binario de un producto de HashiCorp (terraform-ls, etc.): el índice
      // JSON del producto dice la última versión y el .zip del OS/arch.
      onProgress?.({ stage: 'resolving', message: `releases.hashicorp.com/${recipe.product}` })
      const asset = await fetchHashicorpAsset(recipe.product)
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-hashicorp-'))
      const archivePath = path.join(tmpDir, asset.filename || 'download.zip')
      try {
        await downloadTo(asset.url, archivePath, onProgress)
        const binaryName = path.basename(config.command)
        const destination = path.join(managedBinDir(), binaryName)
        await extractBinary(archivePath, recipe.binaryPath ?? binaryName, destination, onProgress)
        onProgress?.({ stage: 'done', message: asset.version })
        return { ...config, command: destination }
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      }
    }
  }
}
