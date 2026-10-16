// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Escenas de eventos SEF — validación/normalización.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ SE PRUEBA Y POR QUÉ
 *
 * El formato es TOLERANTE por diseño (un pack roto no puede tumbar la app),
 * así que lo que se rompe en silencio es:
 *
 *   1. los DEFAULTS — si `emit` deja de default-ear `size`, el murciélago sale
 *      de 1px y el pack parece "no hacer nada",
 *   2. el descarte — una op basura tiene que caer SIN llevarse el resto de la
 *      escena, y
 *   3. el límite de seguridad — la geometría es datos para `Path2D`, así que no
 *      puede traer marcado, y los colores no pueden traer inyección.
 */

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import {
  isEffectColor,
  normalizeEventScene,
  parseEventContributions
} from '../src/renderer/src/services/extensions/types/events/schema'

const ctx = { hasModule: () => false }

describe('normaliza una escena válida', () => {
  const scene = {
    specVersion: 1,
    schedule: { from: '2026-10-20', until: '2026-10-31' },
    activation: { mode: 'notify', once: false, priority: 10 },
    intensity: 0.75,
    durationMs: 45000,
    override: { theme: 'blood-cult' },
    sounds: { wind: { zzfx: [1, 2, 3], gain: 0.3, loop: true } },
    strings: { hola: 'Hola' },
    timeline: [
      { at: 3000, op: 'stage.shake', intensity: 4 },
      { at: 0, op: 'stage.fog' },
      { op: 'emit', draw: { path: 'M0 0 L1 1', viewBox: [24, 12] }, count: 9 }
    ]
  }

  const out = normalizeEventScene(scene)

  it('la conserva y ORDENA el timeline por `at`', () => {
    expect(out).not.toBeNull()
    expect(out!.timeline.map((o) => o.at)).toEqual([0, undefined, 3000])
    expect(out!.timeline[2].op).toBe('stage.shake')
  })

  it('aplica defaults (fog, emit, sonidos)', () => {
    const fog = out!.timeline[0]
    expect(fog.amount).toBe(0.4)
    expect(fog.fade).toBe(1200)
    const emit = out!.timeline[1]
    expect(emit.count).toBe(9)
    expect(emit.size).toBe(10)
    expect(emit.life).toBe(6000)
    expect(out!.sounds!.wind.gain).toBe(0.3)
    expect(out!.sounds!.wind.loop).toBe(true)
  })

  it('conserva ventana, activación, intensidad y override', () => {
    expect(out!.schedule).toEqual({ from: '2026-10-20', until: '2026-10-31' })
    expect(out!.activation).toEqual({ mode: 'notify', once: false, priority: 10 })
    expect(out!.intensity).toBe(0.75)
    expect(out!.durationMs).toBe(45000)
    expect(out!.override).toEqual({ theme: 'blood-cult' })
  })
})

describe('descarta lo roto SIN llevarse el resto', () => {
  it('op desconocida, emit sin draw, tint sin color, audio sin sound', () => {
    const out = normalizeEventScene({
      specVersion: 1,
      timeline: [
        { op: 'no.existe' },
        { op: 'emit', count: 5 },
        { op: 'stage.tint' },
        { op: 'audio.play' },
        { op: 'notify' },
        { op: 'stage.fog' }
      ]
    })
    expect(out).not.toBeNull()
    expect(out!.timeline).toHaveLength(1)
    expect(out!.timeline[0].op).toBe('stage.fog')
  })

  it('sin timeline utilizable, no hay escena', () => {
    expect(normalizeEventScene({ specVersion: 1 })).toBeNull()
    expect(normalizeEventScene({ specVersion: 1, timeline: [{ op: 'nope' }] })).toBeNull()
    expect(normalizeEventScene('no soy una escena')).toBeNull()
    expect(normalizeEventScene(null)).toBeNull()
  })

  it('la geometría no puede traer marcado', () => {
    expect(
      normalizeEventScene({
        timeline: [{ op: 'emit', draw: { path: '<script>alert(1)</script>' } }]
      })
    ).toBeNull()
    expect(
      normalizeEventScene({
        timeline: [{ op: 'emit', draw: { path: 'M'.repeat(5000) } }]
      })
    ).toBeNull()
  })

  it('acota los números (nada de 10.000 partículas)', () => {
    const out = normalizeEventScene({
      timeline: [
        { op: 'emit', count: 9999, draw: { path: 'M0 0' }, jitter: 5, flapHz: 900 },
        { op: 'stage.vignette', amount: 12 }
      ]
    })!
    expect(out.timeline[0].count).toBe(200)
    expect(out.timeline[0].jitter).toBe(1)
    expect(out.timeline[0].flapHz).toBe(30)
    expect(out.timeline[1].amount).toBe(1)
  })
})

describe('colores: token o CSS, nunca inyección', () => {  it('acepta tokens del tema y colores CSS', () => {
    for (const token of ['accent', 'text', 'textMuted', 'error', 'warning', 'success']) {
      expect(isEffectColor(token)).toBe(true)
    }
    expect(isEffectColor('#ff0000')).toBe(true)
    expect(isEffectColor('rgba(255,0,0,.5)')).toBe(true)
    expect(isEffectColor('hsl(12 50% 30%)')).toBe(true)
    expect(isEffectColor('transparent')).toBe(true)
  })

  it('rechaza basura y CSS con estructura', () => {
    expect(isEffectColor('red; background: url(http://x)')).toBe(false)
    expect(isEffectColor('url(evil.png)')).toBe(false)
    expect(isEffectColor('expression(alert(1))')).toBe(false)
    expect(isEffectColor(42)).toBe(false)
    expect(
      normalizeEventScene({
        timeline: [{ op: 'stage.tint', tint: 'red;display:none' }]
      })
    ).toBeNull()
  })
})

describe('contribution del manifest', () => {
  it('exige id + name y un camino o una escena inline', () => {
    const out = parseEventContributions(
      [
        { id: 'ok', name: 'Ok', path: 'events/ok.json' },
        { id: 'inline', name: 'Inline', scene: { timeline: [] } },
        { id: 'sin-nada', name: 'Nada' },
        { name: 'sin id' },
        'basura'
      ],
      ctx
    )
    expect(out).not.toBeNull()
    expect(out!.map((c) => c.id)).toEqual(['ok', 'inline'])
  })

  it('un slice que no es array no se acepta', () => {
    expect(parseEventContributions({ id: 'x' }, ctx)).toBeNull()
  })
})

/**
 * La escena REAL del pack de Halloween vive en `extensions/` (repo de
 * extensiones, no versionado acá). Si está, se valida; si no está (CI), se
 * saltea — así el contrato queda cubierto sin depender de un archivo ajeno.
 */
const packScene = new URL(
  '../extensions/halloween-themes/events/halloween-night.json',
  import.meta.url
)

describe.skipIf(!existsSync(packScene))('el pack de Halloween', () => {
  it('su escena es válida y tiene ventana del 20 al 31', () => {
    const raw = JSON.parse(readFileSync(packScene, 'utf8')) as unknown
    const out = normalizeEventScene(raw)
    expect(out).not.toBeNull()
    expect(out!.schedule).toEqual({ from: '2026-10-20', until: '2026-10-31' })
    expect(out!.timeline.length).toBeGreaterThan(5)
    // Ninguna op se perdió por inválida: la escena tiene las que declara.
    const rawTimeline = (raw as { timeline: unknown[] }).timeline
    expect(out!.timeline).toHaveLength(rawTimeline.length)
  })
})

/**
 * Sonidos: archivo real del pack o ZzFX (8 bits).
 *
 * El audio sintetizado servía para un juego de 8 bits, no para ambiente: un
 * trueno tenía que ser un ARCHIVO. Lo que se rompe en silencio es una ruta fuera
 * del paquete (o que no es audio) colándose como sonido válido.
 */
describe('sonidos: archivo del pack o ZzFX', () => {
  const sceneWith = (sounds: unknown): ReturnType<typeof normalizeEventScene> =>
    normalizeEventScene({ specVersion: 1, sounds, timeline: [{ op: 'stage.fog' }] })

  it('acepta un archivo del paquete con su ganancia', () => {
    const out = sceneWith({ trueno: { file: 'assets/trueno.ogg', gain: 0.5 } })
    expect(out!.sounds!.trueno.file).toBe('assets/trueno.ogg')
    expect(out!.sounds!.trueno.zzfx).toBeUndefined()
    expect(out!.sounds!.trueno.gain).toBe(0.5)
  })

  it('sigue aceptando ZzFX (8 bits, sin archivos)', () => {
    const out = sceneWith({ coin: { zzfx: [1, 0, 200], loop: true } })
    expect(out!.sounds!.coin.zzfx).toEqual([1, 0, 200])
    expect(out!.sounds!.coin.loop).toBe(true)
  })

  it('rechaza rutas fuera del paquete, que no son audio, o sin nada', () => {
    const out = sceneWith({
      absoluta: { file: '/etc/passwd' },
      afuera: { file: '../../secreto.ogg' },
      noAudio: { file: 'assets/notas.txt' },
      vacio: { gain: 0.5 }
    })
    // Todos descartados: la escena queda sin `sounds`.
    expect(out!.sounds).toBeUndefined()
  })

  it('un sonido roto no se lleva a los sanos', () => {
    const out = sceneWith({ ok: { file: 'assets/a.ogg' }, malo: { gain: 1 } })
    expect(Object.keys(out!.sounds!)).toEqual(['ok'])
  })
})
