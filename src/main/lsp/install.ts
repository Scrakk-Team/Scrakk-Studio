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
import type { LspServerConfig } from '@shared/lsp'
import { scrakkHome } from '../scrakkFolder'

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

/** ¿El comando vive en los dirs gestionados? Devuelve la ruta absoluta. */
export async function resolveManagedCommand(command: string): Promise<string | null> {
  if (path.isAbsolute(command)) return null
  const candidates = [
    path.join(managedBinDir(), command),
    path.join(managedNpmDir(), 'bin', command)
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
      return {
        cmd: 'npm',
        args: ['install', '-g', '--prefix', managedNpmDir(), recipe.package]
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

function run(
  cmd: string,
  args: string[],
  env?: Record<string, string>
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: env ? { ...process.env, ...env } : process.env
    })
    let stderr = ''
    child.stderr?.setEncoding('utf-8')
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
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

async function downloadTo(url: string, destination: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`download ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.writeFile(destination, buffer)
}

async function extractBinary(archivePath: string, binaryPathInArchive: string, destination: string): Promise<void> {
  await fs.mkdir(path.dirname(destination), { recursive: true })

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
    const { code, stderr } = await run('tar', ['-xf', archivePath, '-C', tmpDir])
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
export async function install(recipe: InstallRecipe, config: LspServerConfig): Promise<LspServerConfig> {
  switch (recipe.kind) {
    case 'npm':
    case 'gem':
    case 'dotnet':
    case 'go': {
      const { cmd, args, env } = buildInstallCommand(recipe)
      const { code, stderr } = await run(cmd, args, env)
      if (code !== 0) throw new Error(`${cmd} exit ${code}: ${stderr.slice(0, 500)}`)
      const managed = await resolveManagedCommand(config.command)
      return managed ? { ...config, command: managed } : config
    }

    case 'custom': {
      const { cmd, args } = buildInstallCommand(recipe)
      const { code, stderr } = await run(cmd, args)
      if (code !== 0) throw new Error(`custom installer exit ${code}: ${stderr.slice(0, 500)}`)
      const managed = await resolveManagedCommand(config.command)
      return managed ? { ...config, command: managed } : config
    }

    case 'github': {
      const asset = await fetchLatestReleaseAsset(recipe.repo, new RegExp(recipe.assetPattern))
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scrakk-lsp-'))
      const archivePath = path.join(tmpDir, asset.name)
      try {
        await downloadTo(asset.url, archivePath)
        const binaryName = path.basename(config.command)
        const destination = path.join(managedBinDir(), binaryName)
        const inArchive = recipe.binaryPath ?? binaryName
        await extractBinary(archivePath, inArchive, destination)
        return { ...config, command: destination }
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      }
    }
  }
}
