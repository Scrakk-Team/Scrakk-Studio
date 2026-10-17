// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * El tipo de contribución `events` — parseo, registro y desregistro.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ SE PRUEBA Y POR QUÉ
 *
 *   1. la cadena completa del loader (slice del manifest → registro → baja),
 *      igual que cualquier otro tipo de contribución,
 *   2. la lectura de la ESCENA desde el paquete (`path` + `readFile`), que es
 *      como viaja un evento en una `.sef` instalada, y
 *   3. el criterio de "nada hardcoded": el motor no puede nombrar a ningún
 *      evento concreto — el pack de Halloween vive en OTRO repo.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { eventsHandler } from '../src/renderer/src/services/extensions/types/events/api'
import { listEvents } from '../src/renderer/src/services/extensions/types/events/logic'

const EXTENSION_ID = 'demo.pack'

const resolverStub = {
  resolveComponent: () => () => Promise.resolve({ default: () => null }),
  resolveIcon: () => undefined,
  hasModule: () => true
}

function makeCtx(readFile: (path: string) => Promise<string | null>) {
  return {
    extensionId: EXTENSION_ID,
    isBuiltin: false,
    resolver: resolverStub as never,
    readFile,
    api: {} as never
  }
}

const INLINE = { specVersion: 1, timeline: [{ op: 'stage.fog' }] }

describe('cadena parse → register → unregister', () => {
  it('registra una escena inline y la libera', async () => {
    const parsed = eventsHandler.parse([{ id: 'demo.night', name: 'Night', scene: INLINE }], {
      hasModule: () => false
    })
    expect(parsed).toHaveLength(1)

    const owned = await eventsHandler.register(parsed![0], makeCtx(async () => null))
    expect(owned).toEqual({ id: 'demo.night' })
    expect(listEvents().map((e) => e.id)).toContain('demo.night')
    expect(listEvents().find((e) => e.id === 'demo.night')!.extensionId).toBe(EXTENSION_ID)

    eventsHandler.unregister([owned])
    expect(listEvents().map((e) => e.id)).not.toContain('demo.night')
  })

  it('lee la escena del paquete cuando viene por `path`', async () => {
    const parsed = eventsHandler.parse(
      [{ id: 'demo.packfile', name: 'Pack file', path: 'events/packfile.json' }],
      { hasModule: () => false }
    )
    const files: Record<string, string> = {
      'events/packfile.json': JSON.stringify({
        specVersion: 1,
        schedule: { from: '2026-10-20', until: '2026-10-31' },
        timeline: [{ op: 'stage.vignette', amount: 0.4 }]
      })
    }

    const owned = await eventsHandler.register(
      parsed![0],
      makeCtx(async (path) => files[path] ?? null)
    )
    const entry = listEvents().find((e) => e.id === 'demo.packfile')
    expect(entry).toBeDefined()
    expect(entry!.scene.schedule).toEqual({ from: '2026-10-20', until: '2026-10-31' })
    expect(entry!.scene.timeline[0].op).toBe('stage.vignette')

    eventsHandler.unregister([owned])
  })

  it('si el archivo no se puede leer, no registra nada', async () => {
    const parsed = eventsHandler.parse([{ id: 'demo.roto', name: 'Roto', path: 'events/x.json' }], {
      hasModule: () => false
    })
    const owned = await eventsHandler.register(parsed![0], makeCtx(async () => null))
    expect(owned).toBeNull()
    expect(listEvents().map((e) => e.id)).not.toContain('demo.roto')
  })

  it('un JSON inválido tampoco registra', async () => {
    const parsed = eventsHandler.parse([{ id: 'demo.bad', name: 'Bad', path: 'events/b.json' }], {
      hasModule: () => false
    })
    const owned = await eventsHandler.register(parsed![0], makeCtx(async () => '{ no soy json'))
    expect(owned).toBeNull()
  })

  it('una escena sin ops válidas no se registra', async () => {
    const parsed = eventsHandler.parse(
      [{ id: 'demo.vacia', name: 'Vacía', scene: { specVersion: 1, timeline: [] } }],
      { hasModule: () => false }
    )
    expect(await eventsHandler.register(parsed![0], makeCtx(async () => null))).toBeNull()
  })
})

describe('nada hardcoded', () => {
  const ROOTS = [
    'src/shared/events',
    'src/renderer/src/services/events',
    'src/renderer/src/services/effects',
    'src/renderer/src/services/extensions/types/events'
  ]

  it('el motor no nombra a ningún evento concreto', () => {
    // Identificadores del pack real (ids de tema y de evento): si alguno aparece
    // en el motor, el evento dejó de ser data y pasó a ser código.
    //
    // NO se busca la palabra "murciélago" a propósito: los comentarios la usan
    // como EJEMPLO de lo que el motor NO conoce ("no sabe qué es un murciélago"),
    // y eso es exactamente lo que querés que diga.
    const PROHIBIDO = /halloween|blood-?cult|sewer-?rot|8bit-?abyss|spooky/i
    const offenders: string[] = []

    for (const root of ROOTS) {
      let files: string[]
      try {
        files = readdirSync(root, { recursive: true }) as string[]
      } catch {
        continue
      }
      for (const file of files) {
        if (!/\.(ts|tsx)$/.test(file)) continue
        const full = `${root}/${file}`
        if (PROHIBIDO.test(readFileSync(full, 'utf8'))) offenders.push(full)
      }
    }

    expect(offenders).toEqual([])
  })

  it('un evento se describe con el contrato, no con un tipo propio', () => {
    const api = readFileSync(
      'src/renderer/src/services/extensions/types/events/api.ts',
      'utf8'
    )
    // El handler sólo parsea/registra/desregistra: cero lógica de un evento.
    expect(api).toContain("kind: 'events'")
    expect(api).toContain('normalizeEventScene')
  })
})

/**
 * Regresión: el loader tiene que importar el bundle si el pack aporta código.
 *
 * `needsBundle` estaba hardcodeado a panels/activityBar/centerTabs, así que un
 * pack cuyos únicos aportes con código eran `overlays` (el rayo y el fondo del
 * evento) quedaba con el resolver VACÍO: la contribución se descartaba en
 * silencio y no se montaba nada.
 */
describe('loader: qué kinds fuerzan el bundle', () => {
  it('overlays y fileHandlers cuentan como código', () => {
    const src = readFileSync(
      'src/renderer/src/services/extensions/loader/installed.ts',
      'utf8'
    )
    const start = src.indexOf('const BUNDLE_KINDS')
    expect(start).toBeGreaterThan(-1)
    const block = src.slice(start, src.indexOf('const needsBundle'))
    for (const kind of ['panels', 'activityBar', 'centerTabs', 'fileHandlers', 'overlays']) {
      expect(block).toContain(`'${kind}'`)
    }
  })
})
