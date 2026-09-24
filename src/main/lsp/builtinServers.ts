// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * LSP — servidores builtin.
 *
 * Réplica del patrón de builtin_servers/ del CLI: definiciones declarativas
 * { command, extensions, rootMarkers, gatedBy }. Un server builtin se
 * registra si su binario existe (PATH → node_modules/.bin del proyecto) o
 * siempre que la config lo pida explícitamente. Los "gated" (linters) solo
 * se registran si el proyecto declara la dependencia.
 *
 * El catálogo cubre los lenguajes core; el usuario puede definir/agregar
 * cualquiera vía .scrakk/lsp.json (que siempre gana).
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { LspServerConfig } from '@shared/lsp'
import { resolveExecutable } from '../binaries'
import { parseLspServerConfig } from './config'
import type { InstallRecipe } from './install'

export interface BuiltinServerDef {
  id: string
  command: string
  args?: string[]
  /** Extensión (con punto) → language id. */
  extensions: Record<string, string>
  /** Markers de raíz de proyecto; sin ellos el server atiende todo. */
  rootMarkers?: string[]
  /** Solo registrar si package.json declara esta dependencia. */
  gatedBy?: string
  /** Receta de auto-instalación si el binario no existe. */
  install?: InstallRecipe
}

export const BUILTIN_SERVERS: BuiltinServerDef[] = [
  {
    id: 'typescript',
    command: 'typescript-language-server',
    args: ['--stdio'],
    extensions: {
      '.ts': 'typescript',
      '.tsx': 'typescriptreact',
      '.js': 'javascript',
      '.jsx': 'javascriptreact',
      '.mjs': 'javascript',
      '.cjs': 'javascript'
    },
    rootMarkers: ['package.json', 'tsconfig.json', 'jsconfig.json'],
    install: { kind: 'npm', package: 'typescript-language-server typescript' },
  },
  {
    id: 'eslint',
    command: 'vscode-eslint-language-server',
    args: ['--stdio'],
    extensions: {
      '.ts': 'typescript',
      '.tsx': 'typescriptreact',
      '.js': 'javascript',
      '.jsx': 'javascriptreact',
      '.vue': 'vue',
      '.svelte': 'svelte'
    },
    rootMarkers: ['package.json', '.eslintrc', '.eslintrc.js', '.eslintrc.json', 'eslint.config.js'],
    gatedBy: 'eslint'
  },
  {
    id: 'biome',
    command: 'biome',
    args: ['lsp-proxy'],
    extensions: {
      '.ts': 'typescript',
      '.tsx': 'typescriptreact',
      '.js': 'javascript',
      '.jsx': 'javascriptreact',
      '.json': 'json'
    },
    rootMarkers: ['biome.json', 'biome.jsonc', 'package.json'],
    gatedBy: '@biomejs/biome',
    install: { kind: 'npm', package: '@biomejs/biome' }
  },
  {
    id: 'python',
    command: 'pyright-langserver',
    args: ['--stdio'],
    extensions: { '.py': 'python', '.pyi': 'python' },
    rootMarkers: ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', '.git'],
    install: { kind: 'npm', package: 'pyright' },
  },
  {
    id: 'rust',
    command: 'rust-analyzer',
    extensions: { '.rs': 'rust' },
    rootMarkers: ['Cargo.toml']
  },
  {
    id: 'go',
    command: 'gopls',
    extensions: { '.go': 'go' },
    rootMarkers: ['go.mod', 'go.work'],
    install: { kind: 'go', package: 'golang.org/x/tools/gopls@latest' },
  },
  {
    id: 'cpp',
    command: 'clangd',
    args: ['--background-index'],
    extensions: { '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.hpp': 'hpp' },
    rootMarkers: ['compile_commands.json', 'CMakeLists.txt', 'Makefile', '.git'],
    install: { kind: 'github', repo: 'clangd/clangd', assetPattern: 'clangd-linux-\\d+\\.\\d+\\.\\d+\\.zip', binaryPath: 'clangd' }
  },
  {
    id: 'java',
    command: 'jdtls',
    extensions: { '.java': 'java' },
    rootMarkers: ['pom.xml', 'build.gradle', 'build.gradle.kts', '.git']
  },
  {
    id: 'kotlin',
    command: 'kotlin-language-server',
    extensions: { '.kt': 'kotlin', '.kts': 'kotlin' },
    rootMarkers: ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'],
    install: { kind: 'github', repo: 'fwcd/kotlin-language-server', assetPattern: '^server\\.zip$', binaryPath: 'kotlin-language-server' }
  },
  {
    id: 'ruby',
    command: 'ruby-lsp',
    extensions: { '.rb': 'ruby' },
    rootMarkers: ['Gemfile', '.git'],
    install: { kind: 'gem', package: 'ruby-lsp' }
  },
  {
    id: 'bash',
    command: 'bash-language-server',
    args: ['start'],
    extensions: { '.sh': 'shellscript', '.bash': 'shellscript', '.zsh': 'shellscript' },
    install: { kind: 'npm', package: 'bash-language-server' },
  },
  {
    id: 'lua',
    command: 'lua-language-server',
    extensions: { '.lua': 'lua' },
    rootMarkers: ['.luarc.json', '.git']
  },
  {
    id: 'css',
    command: 'vscode-css-language-server',
    args: ['--stdio'],
    extensions: { '.css': 'css', '.scss': 'scss', '.less': 'less' },
    install: { kind: 'npm', package: 'vscode-langservers-extracted' },
  },
  {
    id: 'html',
    command: 'vscode-html-language-server',
    args: ['--stdio'],
    extensions: { '.html': 'html' },
    install: { kind: 'npm', package: 'vscode-langservers-extracted' },
  },
  {
    id: 'json',
    command: 'vscode-json-language-server',
    args: ['--stdio'],
    extensions: { '.json': 'json', '.jsonc': 'jsonc' },
    install: { kind: 'npm', package: 'vscode-langservers-extracted' },
  },
  {
    id: 'yaml',
    command: 'yaml-language-server',
    args: ['--stdio'],
    extensions: { '.yaml': 'yaml', '.yml': 'yaml' },
    install: { kind: 'npm', package: 'yaml-language-server' },
  },
  {
    id: 'markdown',
    command: 'marksman',
    extensions: { '.md': 'markdown' },
    install: { kind: 'github', repo: 'artempyanykh/marksman', assetPattern: 'marksman-linux-x64', binaryPath: 'marksman' },
  },
  {
    id: 'zig',
    command: 'zls',
    extensions: { '.zig': 'zig' },
    rootMarkers: ['build.zig', '.git'],
    install: { kind: 'github', repo: 'zigtools/zls', assetPattern: 'zls-x86_64-linux\\.tar\\.xz', binaryPath: 'zls' }
  },
  {
    id: 'elixir',
    command: 'elixir-ls',
    extensions: { '.ex': 'elixir', '.exs': 'elixir' },
    rootMarkers: ['mix.exs']
  },
  {
    id: 'dart',
    command: 'dart',
    args: ['language-server', '--protocol=lsp4raw'],
    extensions: { '.dart': 'dart' },
    rootMarkers: ['pubspec.yaml']
  },
  {
    id: 'prisma',
    command: 'prisma-language-server',
    args: ['--stdio'],
    extensions: { '.prisma': 'prisma' },
    rootMarkers: ['package.json', 'schema.prisma'],
    install: { kind: 'npm', package: '@prisma/language-server' }
  },
  {
    id: 'terraform',
    command: 'terraform-ls',
    extensions: { '.tf': 'terraform' },
    rootMarkers: ['.terraform', '*.tf']
  },
  {
    id: 'dockerfile',
    command: 'docker-langserver',
    args: ['--stdio'],
    extensions: { Dockerfile: 'dockerfile', '.dockerfile': 'dockerfile' },
    install: { kind: 'npm', package: 'dockerfile-language-server-nodejs' }
  },
  {
    id: 'cmake',
    command: 'cmake-language-server',
    extensions: { '.cmake': 'cmake', 'CMakeLists.txt': 'cmake' }
  },
  {
    id: 'vue',
    command: 'vue-language-server',
    args: ['--stdio'],
    extensions: { '.vue': 'vue' },
    rootMarkers: ['package.json'],
    install: { kind: 'npm', package: '@vue/language-server' }
  },
  {
    id: 'svelte',
    command: 'svelteserver',
    args: ['--stdio'],
    extensions: { '.svelte': 'svelte' },
    rootMarkers: ['package.json']
  }
]

/** Marker literal (no glob) soportado por nearestRoot. */
function isLiteralMarker(marker: string): boolean {
  return !marker.includes('*')
}

export function rootMarkersFor(serverName: string): string[] | undefined {
  const def = BUILTIN_SERVERS.find((server) => server.id === serverName)
  if (!def?.rootMarkers) return undefined
  const literals = def.rootMarkers.filter(isLiteralMarker)
  return literals.length > 0 ? literals : undefined
}

/**
 * ¿Existe el binario en PATH?
 *
 * Se resuelve con `resolveExecutable` y no spawneando `which`/`where`: esos dos
 * comandos faltan en instalaciones mínimas (y dependen ellos mismos del PATH,
 * que es justo lo que aquí hay que mirar). Además `resolveExecutable` usa el
 * PATH AUMENTADO (`binaries.ts`), así que un server instalado con nvm o en
 * `~/.local/bin` cuenta como disponible aunque la app se haya abierto desde el
 * menú del escritorio.
 */
export function commandResolves(command: string): Promise<boolean> {
  // Un server que escucha en TCP no tiene binario que resolver.
  if (command.includes(':') && /^\d{1,3}(\.\d{1,3}){3}:\d+/.test(command)) return Promise.resolve(true)
  if (path.isAbsolute(command)) {
    return fs.access(command).then(() => true, () => false)
  }
  return Promise.resolve(resolveExecutable(command) !== null)
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Registra TODOS los builtins del catálogo (para que el modal de gestión
 * muestre la lista completa). Los gated (linters) solo si package.json
 * declara la dependencia.
 *
 * La DISPONIBILIDAD del binario NO filtra aquí: se reporta por-server vía
 * `builtinAvailability` y decide el botón Instalar / auto-instalación al
 * abrir un archivo matcheo.
 */
export async function discoverBuiltinServers(projectRoot: string): Promise<Record<string, LspServerConfig>> {
  const discovered: Record<string, LspServerConfig> = {}

  let packageJsonDeps: Set<string> | null = null
  try {
    const raw = await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>
    packageJsonDeps = new Set(
      Object.keys({ ...parsed.dependencies, ...parsed.devDependencies })
    )
  } catch {
    packageJsonDeps = null
  }

  for (const def of BUILTIN_SERVERS) {
    if (def.gatedBy && (!packageJsonDeps || !packageJsonDeps.has(def.gatedBy))) continue

    const config = parseLspServerConfig(
      { command: def.command, args: def.args, extensions: def.extensions },
      def.id
    )
    if (config) discovered[def.id] = config
  }

  return discovered
}

/**
 * Disponibilidad real por id (PATH o node_modules/.bin del proyecto),
 * cacheada por carga de root. Alimenta status().available y el botón.
 */
export async function builtinAvailability(
  projectRoot: string,
  ids: string[]
): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {}
  for (const id of ids) {
    const def = BUILTIN_SERVERS.find((candidate) => candidate.id === id)
    if (!def) continue
    let available = await commandResolves(def.command)
    if (!available) {
      const localBin = path.join(projectRoot, 'node_modules', '.bin', def.command)
      available = await fileExists(localBin)
    }
    out[id] = available
  }
  return out
}
