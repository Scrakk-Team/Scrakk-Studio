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
import { execFile } from 'child_process'
import type { LspServerConfig } from '@shared/lsp'
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
    gatedBy: '@biomejs/biome'
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
    extensions: { '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.hpp': 'cpp' },
    rootMarkers: ['compile_commands.json', 'CMakeLists.txt', 'Makefile', '.git']
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
    rootMarkers: ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts']
  },
  {
    id: 'ruby',
    command: 'ruby-lsp',
    extensions: { '.rb': 'ruby' },
    rootMarkers: ['Gemfile', '.git']
  },
  {
    id: 'bash',
    command: 'bash-language-server',
    args: ['start'],
    extensions: { '.sh': 'shellscript', '.bash': 'shellscript', '.zsh': 'shellscript' },
    install: { kind: 'npm', package: '@bash-lsp/bash-language-server server' },
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
    install: { kind: 'github', repo: 'fxplol/marksman-bin', assetPattern: 'marksman-linux-x64', binaryPath: 'marksman' },
  },
  {
    id: 'zig',
    command: 'zls',
    extensions: { '.zig': 'zig' },
    rootMarkers: ['build.zig', '.git']
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
    rootMarkers: ['package.json', 'schema.prisma']
  },
  {
    id: 'terraform',
    command: 'terraform-ls',
    extensions: { '.tf': 'terraform' },
    rootMarkers: ['.terraform', '*.tf']
  },
  {
    id: 'dockerfile',
    command: 'dockerfile-language-server-nodejs',
    args: ['--stdio'],
    extensions: { 'Dockerfile': 'dockerfile', '.dockerfile': 'dockerfile' }
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
    rootMarkers: ['package.json']
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

/** ¿Existe el binario en PATH? */
export function commandResolves(command: string): Promise<boolean> {
  if (command.includes(':') && /^\d{1,3}(\.\d{1,3}){3}:\d+/.test(command)) return Promise.resolve(true)
  if (path.isAbsolute(command)) {
    return fs.access(command).then(() => true, () => false)
  }
  return new Promise((resolve) => {
    const which = process.platform === 'win32' ? 'where' : 'which'
    execFile(which, [command], (error) => resolve(!error))
  })
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
 * Descubre builtins disponibles para un proyecto:
 *  - binario en PATH, O
 *  - binario en <root>/node_modules/.bin/<command>, O
 *  - gated: solo si package.json declara la dependencia (y hay binario).
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

    let available = await commandResolves(def.command)
    if (!available) {
      const localBin = path.join(projectRoot, 'node_modules', '.bin', def.command)
      available = await fileExists(localBin)
    }
    if (!available) continue

    const config = parseLspServerConfig(
      { command: def.command, args: def.args, extensions: def.extensions },
      def.id
    )
    if (config) discovered[def.id] = config
  }

  return discovered
}
