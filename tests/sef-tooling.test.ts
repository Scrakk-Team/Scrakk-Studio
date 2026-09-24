// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del tooling SEF — create/build/pack/validate de extremo a extremo.
 * El .sef resultante se verifica con unzipSync (mismo código que usa el
 * instalador real del IDE).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { unzipSync } from 'fflate'
import { createScaffold, buildBundle, packSef, generateModulesEntry } from '../tools/sef/api'
import { validateManifest, validatePackage } from '../tools/sef/schema'
import { makeTempDir, cleanupDir } from './helpers/lsp-test-utils'

let workDir: string | undefined

beforeEach(async () => {
  workDir = await makeTempDir('sef-tool-')
})

afterEach(async () => {
  await cleanupDir(workDir)
})

describe('create (scaffold)', () => {
  it('genera manifest válido + panel ejemplo', async () => {
    const root = await createScaffold({ name: 'Mi Ext', targetDir: workDir! })

    expect(path.basename(root)).toBe('mi-ext')
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf-8'))
    expect(manifest.id).toBe('mi-ext')
    expect(manifest.contributes.panels[0].component).toBe('panels/Panel.tsx')
    await fs.access(path.join(root, 'panels', 'Panel.tsx'))

    // El scaffold nace válido.
    expect(await validatePackage(root)).toEqual([])
  })
})

describe('validate', () => {
  it('detecta manifest inválido', async () => {
    const issues = validateManifest({ name: 'sin id ni version' })
    const fields = issues.map((i) => i.field)
    expect(fields).toContain('id')
    expect(fields).toContain('version')
  })

  it('rechaza permisos fuera del catálogo', () => {
    const issues = validateManifest({
      id: 'x',
      name: 'X',
      version: '0.1.0',
      permissions: ['root.superuser'],
      contributes: {}
    })
    expect(issues.some((i) => i.field === 'permissions')).toBe(true)
  })

  it('rechaza tipos de contribución desconocidos', () => {
    const issues = validateManifest({
      id: 'x',
      name: 'X',
      version: '0.1.0',
      contributes: { hackThePlanet: [] }
    })
    expect(issues.some((i) => i.field === 'contributes.hackThePlanet')).toBe(true)
  })

  it('valida runtime: exige { kind, entry } con entry string', () => {
    const ok = validateManifest({
      id: 'x',
      name: 'X',
      version: '0.1.0',
      runtime: { kind: 'node', entry: 'extension.js' },
      contributes: {}
    })
    expect(ok.some((i) => i.field === 'runtime')).toBe(false)

    for (const bad of [null, 'extension.js', {}, { kind: 'node' }, { kind: 'node', entry: 1 }]) {
      const issues = validateManifest({
        id: 'x',
        name: 'X',
        version: '0.1.0',
        runtime: bad,
        contributes: {}
      })
      expect(issues.some((i) => i.field === 'runtime')).toBe(true)
    }
  })

  it('rechaza contributes.commands (no hay handler declarativo)', () => {
    const issues = validateManifest({
      id: 'x',
      name: 'X',
      version: '0.1.0',
      contributes: { commands: [{ command: 'acme.deploy' }] }
    })
    expect(issues.some((i) => i.field === 'contributes.commands')).toBe(true)
  })

  it('tema v2 sin path exige themes/<id>.json por convención', async () => {
    const root = path.join(workDir!, 'theme-pack')
    await fs.mkdir(root, { recursive: true })
    const manifest = {
      id: 'tp',
      name: 'TP',
      version: '0.1.0',
      contributes: { themes: [{ id: 'mi-tema', name: 'Mi Tema', type: 'dark' }] }
    }
    await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest))

    const issues = await validatePackage(root)
    expect(issues.some((i) => i.field.includes('themes/mi-tema.json'))).toBe(true)
  })
})

describe('build + pack E2E', () => {
  it('scaffold → build → pack produce .sef legible por el instalador del IDE', async () => {
    const root = await createScaffold({ name: 'E2E Ext', targetDir: workDir! })

    // build genera dist/modules.js con el mapa desde el manifest.
    const built = await buildBundle(root)
    expect(built.modules).toEqual(['panels/Panel.tsx'])

    const bundle = await fs.readFile(path.join(root, 'dist', 'modules.js'), 'utf-8')
    expect(bundle).toMatch(/export\s*{?[\s\S]*modules/) // esbuild: var modules; export { modules }

    // pack valida + zipea.
    const sefPath = await packSef(root)
    expect(sefPath.endsWith('.sef')).toBe(true)

    // El zip contiene exactamente lo que el instalador espera.
    const zip = unzipSync(new Uint8Array(await fs.readFile(sefPath)))
    expect(Object.keys(zip)).toContain('manifest.json')
    expect(Object.keys(zip).some((k) => k.startsWith('dist/'))).toBe(true)

    // Y el manifest dentro es el mismo.
    const manifestInZip = JSON.parse(
      new TextDecoder().decode(zip['manifest.json'])
    )
    expect(manifestInZip.id).toBe('e2e-ext')
  }, 30_000)

  it('pack falla si el paquete es inválido', async () => {
    const root = path.join(workDir!, 'broken')
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(
      path.join(root, 'manifest.json'),
      JSON.stringify({ name: 'sin id' })
    )

    await expect(packSef(root)).rejects.toThrow(/validación/)
  })
})

describe('generateModulesEntry', () => {
  it('mapea rutas del manifest → imports relativos al package root', () => {
    const entry = generateModulesEntry([
      'panels/clock/ClockPanel.tsx',
      'activitybar/icon.ts'
    ])
    expect(entry).toContain("import C0 from './panels/clock/ClockPanel'")
    expect(entry).toContain("import C1 from './activitybar/icon'")
    expect(entry).toContain('"panels/clock/ClockPanel.tsx": C0')
    expect(entry).toContain('"activitybar/icon.ts": C1')
  })

  it('paquete sin código → modules vacío', () => {
    const entry = generateModulesEntry([])
    expect(entry).toContain('export const modules = {}')
  })
})
