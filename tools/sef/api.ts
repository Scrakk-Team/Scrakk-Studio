// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * SEF tooling — operaciones (create / build / pack / validate).
 *
 * - build: genera el mapa `modules` desde el manifest (nada hardcodeado) y
 *   compila con esbuild a dist/modules.js.
 * - pack: zipea manifest + dist + carpetas de data (themes/, lsp/) → .sef.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { zipSync, type Zippable } from 'fflate'
import { SEF, collectCodePaths } from './config.ts'
import { validatePackage } from './schema.ts'

// ── create ─────────────────────────────────────────────────────────────────

export interface ScaffoldOptions {
  name: string
  targetDir: string
}

export async function createScaffold(options: ScaffoldOptions): Promise<string> {
  const id = options.name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const root = path.join(options.targetDir, id)

  const manifest = {
    id,
    name: options.name,
    version: '0.1.0',
    author: '',
    description: `${options.name} — extensión Scrakk Studio.`,
    engine: '>=0.1.0',
    permissions: [] as string[],
    contributes: {
      panels: [
        {
          id: `${id}-panel`,
          title: options.name,
          closable: true,
          component: 'panels/Panel.tsx'
        }
      ]
    }
  }

  const panelSource = `export default function Panel() {
  return (
    <div style={{ padding: 16, fontSize: 13 }}>
      <strong>${options.name}</strong>
      <p>Mi primera extensión de Scrakk Studio.</p>
    </div>
  )
}
`

  await fs.mkdir(path.join(root, 'panels'), { recursive: true })
  await fs.writeFile(
    path.join(root, SEF.MANIFEST),
    JSON.stringify(manifest, null, 2) + '\n'
  )
  await fs.writeFile(path.join(root, 'panels', 'Panel.tsx'), panelSource)
  return root
}

// ── build ──────────────────────────────────────────────────────────────────

/** Entry virtual que mapea rutas del manifest → exports del bundle. */
export function generateModulesEntry(codePaths: string[]): string {
  const lines = codePaths.map((codePath, index) => {
    const relative = './' + codePath.replace(/\.tsx?$/, '')
    return `import C${index} from '${relative}'`
  })
  if (codePaths.length === 0) {
    return `${lines.join('\n')}\n\nexport const modules = {}\n`
  }
  const map = codePaths
    .map((codePath, index) => `  ${JSON.stringify(codePath)}: C${index}`)
    .join(',\n')
  return `${lines.join('\n')}\n\nexport const modules = {\n${map}\n}\n`
}

/** Compila el paquete a dist/modules.js usando el manifest como fuente. */
export async function buildBundle(packageRoot: string): Promise<{ outPath: string; modules: string[] }> {
  const raw = await fs.readFile(path.join(packageRoot, SEF.MANIFEST), 'utf-8')
  const manifest = JSON.parse(raw) as Record<string, unknown>
  const codePaths = collectCodePaths(manifest)

  const entry = generateModulesEntry(codePaths)
  const esbuild = await import('esbuild')

  const result = await esbuild.build({
    stdin: {
      contents: entry,
      resolveDir: packageRoot,
      sourcefile: 'virtual-modules-entry.ts'
    },
    bundle: true,
    format: 'esm',
    jsx: 'automatic',
    platform: 'browser',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
    external: ['react', 'react-dom']
  })

  const outPath = path.join(packageRoot, SEF.ENTRY)
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, result.outputFiles![0].contents)
  return { outPath, modules: codePaths }
}

// ── pack ───────────────────────────────────────────────────────────────────

/**
 * Zipea el paquete a `<root>.sef`: manifest + dist + data por convención.
 * Devuelve la ruta del .sef generado.
 */
export async function packSef(packageRoot: string): Promise<string> {
  // Nunca empaquetar un paquete inválido (la CLI también valida; doble cinturón).
  const issues = await validatePackage(packageRoot)
  if (issues.length > 0) {
    throw new Error(
      'validación fallida: ' +
        issues.map((issue) => `${issue.field}: ${issue.message}`).join('; ')
    )
  }

  const files: Zippable = {}

  const addDir = async (dir: string, zipPrefix: string): Promise<void> => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return // carpeta opcional
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      const key = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await addDir(full, key)
      } else {
        files[key] = new Uint8Array(await fs.readFile(full))
      }
    }
  }

  await addDir(path.join(packageRoot, SEF.DIST), SEF.DIST)
  await addDir(path.join(packageRoot, SEF.THEMES_DIR), SEF.THEMES_DIR)
  await addDir(path.join(packageRoot, SEF.ICONS_DIR), SEF.ICONS_DIR)
  await addDir(path.join(packageRoot, SEF.PRODUCT_ICONS_DIR), SEF.PRODUCT_ICONS_DIR)
  await addDir(path.join(packageRoot, SEF.LSP_DIR), SEF.LSP_DIR)
  files[SEF.MANIFEST] = new Uint8Array(
    await fs.readFile(path.join(packageRoot, SEF.MANIFEST))
  )

  const zipped = zipSync(files)
  const outPath = packageRoot.replace(/[\\/]+$/, '') + SEF.EXTENSION_EXT
  await fs.writeFile(outPath, zipped)
  return outPath
}
