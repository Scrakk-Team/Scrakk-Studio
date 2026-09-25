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
import { unzipSync } from 'fflate'
import type { LspInstallProgressPayload, LspServerConfig } from '@shared/lsp'
import { scrakkHome } from '../scrakkFolder'
import { resolveExecutable } from '../binaries'

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
      // La descarga de releases no es un argv: la maneja install() directo.
      return { cmd: 'curl', args: [`https://api.github.com/repos/${recipe.repo}/releases/latest`] }
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
      `o pon su directorio en el PATH (se buscan también ~/.local/bin, nvm, fnm, volta, snap y linuxbrew).`
  )
}

function run(
  cmd: string,
  args: string[],
  env?: Record<string, string>,
  onLine?: (line: string) => void
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      // stdout TAMBIÉN se lee: npm/go reportan el avance ahí. No se usa para
      // calcular un % (no lo dan), pero sí como texto de fase para la UI.
      stdio: ['ignore', 'pipe', 'pipe'],
      env: env ? { ...process.env, ...env } : process.env
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

  if (archivePath.endsWith('.zip')) {
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
    case 'dotnet':
    case 'go': {
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
  }
}
