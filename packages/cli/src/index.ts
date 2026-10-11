// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * SEF tooling — CLI.
 *
 *   sef create <nombre> [dir-destino]
 *   sef build <dir-paquete>
 *   sef pack <dir-paquete>
 *   sef validate <dir-paquete>
 */

import * as fs from 'node:fs/promises'
import { resolve } from 'node:path'
import { createScaffold, buildBundle, packSef } from './api.ts'
import { validatePackage } from './schema.ts'

const USAGE = `sef — Scrakk Studio extension tooling (SEF)

uso:
  sef create <nombre> [dir-destino]   scaffold con panel de ejemplo
  sef build <dir-paquete>             bundle → dist/modules.js
  sef pack <dir-paquete>              valida y escribe <dir>.sef
  sef validate <dir-paquete>          solo valida

opciones:
  -v, --version                       versión del CLI
  -h, --help                          esta ayuda`

async function readVersion(): Promise<string> {
  try {
    const url = new URL('../package.json', import.meta.url)
    const raw = await fs.readFile(url, 'utf-8')
    return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2)

  switch (command) {
    case 'create': {
      const name = args[0]
      if (!name) throw new Error('uso: sef create <nombre> [dir]')
      const target = resolve(args[1] ?? '.')
      const root = await createScaffold({ name, targetDir: target })
      console.log(`✓ scaffold creado en ${root}`)
      break
    }
    case 'build': {
      const dir = resolve(args[0] ?? '.')
      const { outPath, modules } = await buildBundle(dir)
      console.log(`✓ bundle: ${outPath} (${modules.length} módulos)`)
      break
    }
    case 'pack': {
      const dir = resolve(args[0] ?? '.')
      const issues = await validatePackage(dir)
      if (issues.length > 0) {
        for (const issue of issues) console.error(`✗ ${issue.field}: ${issue.message}`)
        throw new Error('validación fallida — no se empaqueta')
      }
      const outPath = await packSef(dir)
      console.log(`✓ paquete: ${outPath}`)
      break
    }
    case 'validate': {
      const dir = resolve(args[0] ?? '.')
      const issues = await validatePackage(dir)
      if (issues.length === 0) {
        console.log('✓ paquete válido')
      } else {
        for (const issue of issues) console.error(`✗ ${issue.field}: ${issue.message}`)
        process.exitCode = 1
      }
      break
    }
    case 'version':
    case '-v':
    case '--version':
      console.log(await readVersion())
      break
    case 'help':
    case '-h':
    case '--help':
      console.log(USAGE)
      break
    default:
      console.log(USAGE)
      process.exitCode = command ? 1 : 0
  }
}

main().catch((error) => {
  console.error('✗', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
