// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del motor de efectos (`services/effects/engine`).
 *
 * Corre en node (sin jsdom real): el motor DEBE sobrevivir sin canvas, sin
 * `Path2D` y sin `requestAnimationFrame`. Acá se prueban los helpers puros, el
 * tope de partículas (+ modo PC mala), reduced-motion, el `clear` y que nada
 * explote sin DOM. Importa `./engine` directo, no el barrel (que arrastra
 * React/CSS).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_PARTICLES,
  WING_SWING_DEG,
  engine,
  flapFrame,
  parsePoint,
  prefersReducedMotion,
  resetEffectsForTests,
  resolveEffectColor
} from '../src/renderer/src/services/effects/engine'
import { resetLowEndModeForTests, setLowEndMode } from '../src/renderer/src/services/perf'

const VP = { w: 1000, h: 500 }
const SHAPE = { path: 'M0 0 L10 10 Z' }

beforeEach(() => {
  resetEffectsForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetLowEndModeForTests()
  resetEffectsForTests()
})

describe('parsePoint', () => {
  it('acepta números como px', () => {
    expect(parsePoint(12, 'x', VP)).toBe(12)
    expect(parsePoint(-4.5, 'y', VP)).toBe(-4.5)
  })

  it('acepta vw / vh', () => {
    expect(parsePoint('50vw', 'x', VP)).toBe(500)
    expect(parsePoint('25vh', 'y', VP)).toBe(125)
  })

  it('el % usa la dimensión del eje', () => {
    expect(parsePoint('10%', 'x', VP)).toBe(100)
    expect(parsePoint('10%', 'y', VP)).toBe(50)
  })

  it('basura → 0 sin romper', () => {
    expect(parsePoint('nope', 'x', VP)).toBe(0)
    expect(parsePoint(Number.NaN, 'x', VP)).toBe(0)
  })
})

describe('resolveEffectColor', () => {
  it('mapea tokens conocidos a su variable CSS', () => {
    expect(resolveEffectColor('accent')).toBe('var(--color-accent)')
    expect(resolveEffectColor('textMuted')).toBe('var(--color-text-muted)')
    expect(resolveEffectColor('error')).toBe('var(--color-danger)')
  })

  it('deja pasar colores CSS crudos', () => {
    expect(resolveEffectColor('#ff0000')).toBe('#ff0000')
    expect(resolveEffectColor('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)')
  })

  it('lee el valor computado cuando hay DOM', () => {
    vi.stubGlobal('document', { documentElement: {} })
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (name: string) => (name === '--color-accent' ? ' #abcdef ' : '')
    }))
    expect(resolveEffectColor('accent')).toBe('#abcdef')
    // Token sin valor computado → cae al var() por defecto.
    expect(resolveEffectColor('warning')).toBe('var(--color-warning)')
  })
})

describe('tope de partículas', () => {
  it('emit 500 no pasa el tope duro', () => {
    engine.emit({ shape: SHAPE, count: 500 }, 1)
    expect(engine.getParticleCount()).toBe(MAX_PARTICLES)
  })

  it('modo PC mala usa la mitad del tope', () => {
    setLowEndMode(true)
    engine.emit({ shape: SHAPE, count: 500 }, 1)
    expect(engine.getParticleCount()).toBeLessThanOrEqual(Math.floor(MAX_PARTICLES / 2))
  })

  it('intensityScale multiplica el count', () => {
    engine.emit({ shape: SHAPE, count: 100 }, 0.5)
    expect(engine.getParticleCount()).toBe(50)
  })
})

describe('reduced motion', () => {
  it('con matchMedia(true): emit no spawnea y shake es no-op', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    resetEffectsForTests() // invalida el cache para releer el stub
    expect(prefersReducedMotion()).toBe(true)

    engine.emit({ shape: SHAPE, count: 10 }, 1)
    expect(engine.getParticleCount()).toBe(0)

    engine.shake(5, 400)
    expect(engine.getStage().shake).toBe(0)

    // fog/tint/vignette SÍ aplican (son estáticos).
    engine.setVignette(0.5)
    engine.setFog(0.25)
    expect(engine.getStage().vignette).toBe(0.5)
    expect(engine.getStage().fog).toBe(0.25)
  })
})

describe('clear', () => {
  it('vuelve el stage a cero y vacía las partículas', () => {
    engine.emit({ shape: SHAPE, count: 50 }, 1)
    engine.setFog(0.8)
    engine.setTint('accent', 0.5)
    engine.setVignette(0.6)
    expect(engine.getParticleCount()).toBeGreaterThan(0)

    engine.clear()

    expect(engine.getParticleCount()).toBe(0)
    expect(engine.getStage()).toEqual({
      fog: 0,
      tint: null,
      tintAmount: 0,
      vignette: 0,
      shake: 0
    })
    expect(engine.getFogTint()).toBeNull()
  })

})

describe('sin canvas / sin Path2D / sin rAF', () => {
  it('el estado funciona y no arranca el loop', () => {
    expect(() => {
      engine.emit({ shape: SHAPE, count: 3 }, 1)
      engine.shake()
      engine.setFog(0.4)
      engine.clear()
    }).not.toThrow()
    expect(engine.isRunning()).toBe(false)
  })

  it('registerCanvas tolera canvas sin contexto', () => {
    const fake = {
      getContext: () => null,
      clientWidth: 0,
      clientHeight: 0,
      width: 0,
      height: 0
    } as unknown as HTMLCanvasElement
    expect(() => engine.registerCanvas(fake)).not.toThrow()
    expect(() => engine.registerCanvas(null)).not.toThrow()
  })
})

/**
 * El aleteo pliega el ALAS, no gira la forma.
 *
 * Esto se arregló DESPUÉS de shippear el primer evento real: con la rotación, el
 * murciélago del pack se leía como una mariposa revoloteando. El test fija la
 * diferencia para que nadie vuelva a la rotación.
 */
describe('aleteo: sólo el ala, el cuerpo quieto', () => {
  it('sin flapHz no hay ángulo de ala', () => {
    expect(flapFrame(0, 1234)).toEqual({ rotation: 0, wingAngle: 0, wingDepth: 0, wingScale: 1 })
    expect(flapFrame(0, 1234, -8)).toEqual({
      rotation: -8,
      wingAngle: 0,
      wingDepth: 0,
      wingScale: 1
    })
  })

  it('el ala oscila entre los dos extremos del batido', () => {
    // A 1 Hz, t=250 es un extremo y t=750 el otro.
    const a = flapFrame(1, 250).wingAngle
    const b = flapFrame(1, 750).wingAngle
    expect(Math.abs(a)).toBeCloseTo(WING_SWING_DEG)
    expect(Math.abs(b)).toBeCloseTo(WING_SWING_DEG)
    expect(Math.sign(a)).toBe(-Math.sign(b))
  })

  it('el cuerpo NO se mueve al aletear (la regresión de la mariposa)', () => {
    for (const hz of [0, 1, 7, 30]) {
      for (let t = 0; t <= 1000; t += 20) {
        // La rotación del cuerpo es EXACTAMENTE la que pidió la escena: el
        // aleteo no la toca (antes le sumaba ±18° y giraba todo el bicho).
        expect(flapFrame(hz, t, 12).rotation).toBe(12)
      }
    }
  })

  it('el ala se ACORTA cuando viene hacia el espectador (3D)', () => {
    // A 1 Hz: t=250 el ala viene (+1), t=750 se va (-1).
    const near = flapFrame(1, 250)
    const far = flapFrame(1, 750)
    expect(near.wingDepth).toBeCloseTo(1)
    expect(far.wingDepth).toBeCloseTo(-1)
    expect(near.wingScale).toBeCloseTo(0.62)
    expect(far.wingScale).toBeCloseTo(1)
    expect(near.wingScale).toBeLessThan(far.wingScale)
  })

  it('nunca deja el ala más allá de ±WING_SWING_DEG', () => {
    for (let hz = 0; hz <= 30; hz++) {
      for (let t = 0; t <= 2000; t += 37) {
        expect(Math.abs(flapFrame(hz, t).wingAngle)).toBeLessThanOrEqual(WING_SWING_DEG + 0.001)
      }
    }
  })
})

describe('emisión: una partícula suelta nunca desaparece por redondeo', () => {
  it('count 1 con intensidad baja sigue emitiendo 1', () => {
    engine.clear(0)
    engine.setIntensity(0.4)
    engine.emit({ shape: SHAPE, count: 1 }, 0.4)
    // Antes: Math.round(1 * 0.4 * 0.4) = 0 → el rayo NUNCA se dibujaba.
    expect(engine.getParticleCount()).toBe(1)
  })

  it('intensidad 0 no emite nada', () => {
    engine.clear(0)
    engine.setIntensity(1)
    engine.emit({ shape: SHAPE, count: 1 }, 0)
    expect(engine.getParticleCount()).toBe(0)
  })
})
