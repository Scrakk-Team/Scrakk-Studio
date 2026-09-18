/**
 * SEF tooling — CLI.
 *
 *   node tools/sef/index.ts create <nombre> [dir-destino]
 *   node tools/sef/index.ts build <dir-paquete>
 *   node tools/sef/index.ts pack <dir-paquete>
 *   node tools/sef/index.ts validate <dir-paquete>
 */

import { resolve } from 'node:path'
import { createScaffold, buildBundle, packSef } from './api.ts'
import { validatePackage } from './schema.ts'

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
    default:
      console.log('uso: sef <create|build|pack|validate> …')
      process.exitCode = command ? 1 : 0
  }
}

main().catch((error) => {
  console.error('✗', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
