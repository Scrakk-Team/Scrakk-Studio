// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tabla única de superficie — contrato, proyección y AUDIT contra el runtime.
 *
 * El valor de estos tests no es cubrir líneas: es que la tabla no pueda
 * mentir. Si alguien agrega un API al host sin declararlo, o declara `real`
 * algo que no existe, o agrega un traductor sin declarar su ruta, esto falla
 * y dice el nombre exacto.
 */

import { describe, it, expect } from 'vitest'
import {
  SURFACE,
  allSurfaceEntries,
  coverageOf,
  coverageReport,
  findSurfaceEntry,
  getSurfaceNamespace,
  validateSurface
} from '../src/shared/compatibility/surface'
import { auditApi, missingFromApi } from '../src/shared/compatibility/surface/audit'
import { KIND_TABLE, detectKinds, describeKinds } from '../src/shared/compatibility/vscode/kinds'
import { TRANSLATORS } from '../src/shared/compatibility/vscode/translators/registry'
import { CODE_MAP, DECLARATIVE_MAP, lookupCodeApi } from '../src/shared/compatibility/vscode/maps'
import { CODE_MARKERS } from '../src/shared/compatibility/vscode/analyze'
import { createVscodeApi } from '../src/main/extensions/host/vscodeApi'
import { unsupported } from '../src/main/extensions/host/vscodeShim'
import type { HostBridge } from '../src/main/extensions/host/vscodeShim'

/**
 * Bridge de mentira: ningún método hace nada. Alcanza para CONSTRUIR el módulo
 * `vscode` (que es lo que se audita), sin Electron, sin stdio y sin proceso.
 */
function stubBridge(): HostBridge {
  return new Proxy({}, { get: () => () => undefined }) as unknown as HostBridge
}

function buildApi(): Record<string, unknown> {
  return createVscodeApi({
    bridge: stubBridge(),
    extensionId: 'surface-audit',
    extensionPath: '/tmp/surface-audit',
    permissions: [],
    mode: 'strict'
  }).api
}

describe('contrato de la tabla', () => {
  it('no tiene entradas mal escritas (sin motivo, ruta sin destino, keys repetidas)', () => {
    expect(validateSurface()).toEqual([])
  })

  it('todo lo que no es `real` explica qué pasa en su lugar', () => {
    const gaps = allSurfaceEntries().filter(({ entry }) => entry.status !== 'real')
    expect(gaps.length).toBeGreaterThan(0)
    for (const { namespace, entry } of gaps) {
      expect(entry.degradation, `${namespace}.${entry.key} sin degradación`).toBeTruthy()
    }
  })

  it('no hay comodines sueltos: los grupos declaran a quién cubren', () => {
    for (const { entry } of allSurfaceEntries()) {
      if (entry.key.endsWith('.*')) {
        expect(entry.covers?.length ?? 0, `${entry.key} sin covers`).toBeGreaterThan(0)
      }
    }
  })

  it('busca por clave completa, incluidos los grupos', () => {
    expect(findSurfaceEntry('window.showQuickPick')?.entry.status).toBe('missing')
    expect(findSurfaceEntry('contributes.themes')?.entry.native).toBe('themes')
    expect(findSurfaceEntry('core.Diagnostic')?.namespace).toBe('core')
    expect(findSurfaceEntry('nope.nope')).toBeNull()
  })
})

describe('lado VSIX ⇄ traductores', () => {
  it('cada ruta `sef` tiene un traductor que produce su kind', () => {
    const problems: string[] = []
    for (const { entry } of allSurfaceEntries()) {
      if (entry.route !== 'sef') continue
      // Un traductor puede servir a DOS keys del manifest (el de paneles cubre
      // `views` y `viewsContainers`), así que la verificación es por kind: si
      // no hay NINGÚN traductor que produzca `entry.native`, la ruta miente.
      const translator = TRANSLATORS.find((candidate) => candidate.sefKind === entry.native)
      if (!translator) problems.push(`${entry.key}: declarado 'sef' (${entry.native}) sin traductor`)
    }
    expect(problems).toEqual([])
  })

  it('no hay traductores huérfanos (todo traductor está declarado)', () => {
    const orphans = TRANSLATORS.filter((translator) => {
      const ref = findSurfaceEntry(`contributes.${translator.vsixKey}`)
      return !ref || ref.entry.route !== 'sef'
    }).map((translator) => translator.vsixKey)
    expect(orphans).toEqual([])
  })

  it('`kinds.ts` es una proyección: estado de la tabla = soporte reportado', () => {
    const contributes = getSurfaceNamespace('contributes')
    for (const entry of contributes?.apis ?? []) {
      const expected =
        entry.status === 'real' ? 'supported' : entry.status === 'partial' ? 'pending' : 'unsupported'
      expect(KIND_TABLE[entry.key]?.support, `${entry.key}`).toBe(expected)
      if (entry.route === 'sef') expect(KIND_TABLE[entry.key]?.sefKind).toBe(entry.native)
      if (entry.status !== 'real') expect(KIND_TABLE[entry.key]?.reason).toBeTruthy()
    }
  })

  it('un VSIX de paneles se clasifica bien, incluido el código', () => {
    const kinds = detectKinds({
      contributes: {
        viewsContainers: { activitybar: [{ id: 'x', title: 'X' }] },
        views: { x: [{ id: 'x.one', name: 'Uno' }] },
        keybindings: [{ command: 'x.cmd', key: 'ctrl+k' }]
      },
      main: './out/extension.js'
    })
    const byKey = Object.fromEntries(kinds.map((kind) => [kind.key, kind]))
    expect(byKey.views.support).toBe('supported')
    expect(byKey.views.sefKind).toBe('views')
    expect(byKey.viewsContainers.support).toBe('supported')
    expect(byKey.keybindings.support).toBe('unsupported')
    expect(byKey.keybindings.reason).toBeTruthy()
    expect(byKey.code.support).toBe('supported')
    expect(describeKinds(kinds)).toContain('×1')
  })

  it('una web extension se reporta como tal, sin confundirla con main', () => {
    const kinds = detectKinds({ browser: './web.js' })
    expect(kinds).toHaveLength(1)
    expect(kinds[0].key).toBe('code.browser')
    expect(kinds[0].support).toBe('unsupported')
  })

  it('un contribution point desconocido no se inventa: se reporta', () => {
    const kinds = detectKinds({ contributes: { madeUpThing: [1, 2] } })
    expect(kinds[0].support).toBe('unsupported')
    expect(kinds[0].reason).toContain('desconocido')
  })
})

describe('audit contra el runtime del host', () => {
  const api = buildApi()

  it('todo lo declarado `real` existe de verdad en el módulo `vscode`', () => {
    expect(missingFromApi(api)).toEqual([])
  })

  it('no hay nada en el host sin declarar en la tabla', () => {
    expect(auditApi(api)).toEqual([])
  })

  it('el api del host tiene los namespaces que la tabla declara', () => {
    for (const id of ['commands', 'window', 'workspace', 'languages', 'env', 'extensions']) {
      expect(typeof api[id], id).toBe('object')
      expect(getSurfaceNamespace(id)?.apis.length ?? 0, id).toBeGreaterThan(0)
    }
  })

  it('una API nueva y no declarada hace fallar el audit (control del propio test)', () => {
    const tampered = { ...api, window: { ...(api.window as object), inventedApi: () => 1 } }
    expect(auditApi(tampered)).toContain('window.inventedApi')
    expect(auditApi({ ...api, languages: undefined })).toContain(
      'languages: el namespace declarado no existe en el api'
    )
  })
})

describe('mensajes de error y cobertura', () => {
  it('`unsupported()` explica el motivo REAL de la tabla', () => {
    const error = unsupported('window.showQuickPick')
    expect(error.message).toContain('window.showQuickPick')
    expect(error.message).toContain(findSurfaceEntry('window.showQuickPick')?.entry.degradation ?? '')
  })

  it('`unsupported()` no inventa motivo para una clave desconocida', () => {
    const error = unsupported('window.algoQueNoExiste')
    expect(error.message).toContain('todavía no está soportado')
    expect(error.message).not.toContain('undefined')
  })

  it('la cobertura suma los estados y lista los huecos con su motivo', () => {
    const contributes = getSurfaceNamespace('contributes')
    expect(contributes).not.toBeNull()
    const coverage = coverageOf(contributes!)
    const sum = Object.values(coverage.byStatus).reduce((total, count) => total + count, 0)
    expect(sum).toBe(coverage.total)
    expect(coverage.score).toBeGreaterThan(0)
    expect(coverage.score).toBeLessThanOrEqual(1)
    for (const gap of coverage.gaps) {
      expect(gap.why.length).toBeGreaterThan(0)
      expect(gap.status).not.toBe('real')
    }
  })

  it('el reporte cubre todos los namespaces y es estable', () => {
    const report = coverageReport()
    expect(report).toHaveLength(SURFACE.length)
    expect(report.map((entry) => entry.id)).toEqual(SURFACE.map((namespace) => namespace.id))
  })
})

/**
 * El mapa de COBERTURA (`maps.ts`) es lo que el usuario lee al instalar. Si
 * miente, miente en la cara más visible del producto.
 */
describe('mapa de cobertura ⇄ host real', () => {
  it('el lado declarativo es una proyección de la tabla (no una lista aparte)', () => {
    const contributes = getSurfaceNamespace('contributes')!
    for (const entry of contributes.apis) {
      const mapped = DECLARATIVE_MAP[`contributes.${entry.key}`]
      expect(mapped, `contributes.${entry.key} no está en el mapa`).toBeDefined()
      if (entry.route === 'sef' && entry.status === 'real') {
        expect(mapped.support).toBe('full')
        expect(mapped.target).toContain(entry.native!)
      }
    }
  })

  it('los tipos que SÍ traducimos no se reportan como «futuro»', () => {
    for (const key of ['views', 'viewsContainers', 'viewsWelcome', 'themes', 'iconThemes']) {
      expect(DECLARATIVE_MAP[`contributes.${key}`]?.support, key).toBe('full')
    }
  })

  it('todos los marcadores del muestreo tienen fila propia', () => {
    for (const marker of CODE_MARKERS) {
      expect(lookupCodeApi(marker).note, marker).not.toBe('unmapped')
    }
  })

  it('no se declara «no soportado» un API que el host implementa de verdad', () => {
    const api = buildApi()
    const implemented: Array<[string, boolean]> = [
      ['vscode.commands.registerCommand', typeof (api.commands as Record<string, unknown>).registerCommand === 'function'],
      ['vscode.window.registerTreeDataProvider', typeof (api.window as Record<string, unknown>).registerTreeDataProvider === 'function'],
      ['vscode.window.createTreeView', typeof (api.window as Record<string, unknown>).createTreeView === 'function'],
      ['vscode.window.registerWebviewViewProvider', typeof (api.window as Record<string, unknown>).registerWebviewViewProvider === 'function'],
      ['vscode.window.createWebviewPanel', typeof (api.window as Record<string, unknown>).createWebviewPanel === 'function'],
      ['vscode.window.createStatusBarItem', typeof (api.window as Record<string, unknown>).createStatusBarItem === 'function'],
      ['vscode.window.createOutputChannel', typeof (api.window as Record<string, unknown>).createOutputChannel === 'function'],
      ['vscode.workspace.fs', Boolean((api.workspace as Record<string, unknown>).fs)],
      ['vscode.workspace.getConfiguration', typeof (api.workspace as Record<string, unknown>).getConfiguration === 'function']
    ]
    for (const [marker, exists] of implemented) {
      // El host lo tiene ⇒ el mapa no puede decir `none`.
      if (exists) expect(lookupCodeApi(marker).support, marker).not.toBe('none')
    }
  })
})
