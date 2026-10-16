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
  engine,
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
