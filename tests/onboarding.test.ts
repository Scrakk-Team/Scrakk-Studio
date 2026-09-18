/**
 * Configuración inicial — máquina de estados, registry, catálogo y PUREZA.
 *
 * El bloque que más importa es `pureza`: lee el código de
 * `features/onboarding/steps/**` y falla si un paso FAKE importa un servicio
 * real. Esa regla es la que mantiene la maqueta separada de la app: si se
 * rompe, la pantalla empieza a mentir (o a tocar cosas reales sin querer).
 *
 * El catálogo se verifica leyendo `steps/index.ts` en vez de importarlo: los
 * pasos reales arrastran servicios del IDE (extensiones → layout → window) y
 * este test corre sin DOM a propósito.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  back,
  clampIndex,
  finish,
  goTo,
  initialState,
  next,
  progressOf,
  reopen,
  shouldShow,
  withSteps
} from '@features/onboarding/state/machine'
import {
  _resetOnboardingRegistryForTests,
  getOnboardingStepIds,
  registerOnboardingStep,
  subscribeToOnboardingSteps,
  unregisterOnboardingStep
} from '@features/onboarding/registry'
import type { OnboardingStep } from '@features/onboarding/types'

const STEPS = ['a', 'b', 'c']
const HERE = path.dirname(fileURLToPath(import.meta.url))
const FEATURE = path.resolve(HERE, '..', 'src/renderer/src/features/onboarding')
const STEPS_DIR = path.join(FEATURE, 'steps')

describe('máquina de estados', () => {
  it('sanea índices fuera de rango (storage corrupto o clic raro)', () => {
    expect(clampIndex(-5, 3)).toBe(0)
    expect(clampIndex(99, 3)).toBe(2)
    expect(clampIndex(1.7, 3)).toBe(1)
    expect(clampIndex(Number.NaN, 3)).toBe(0)
    expect(clampIndex('2', 3)).toBe(0)
    expect(clampIndex(0, 0)).toBe(0)
  })

  it('sin estado guardado arranca en el paso 0 (primer arranque)', () => {
    const state = initialState(STEPS, null, null)
    expect(state.index).toBe(0)
    expect(state.status).toBe('running')
    expect(shouldShow(state)).toBe(true)
  })

  it('reanuda donde quedó y marca los pasos previos como visitados', () => {
    const state = initialState(STEPS, 'running', 2)
    expect(state.index).toBe(2)
    expect(state.visited).toBe(2)
    expect(progressOf(state).marks).toEqual(['visited', 'visited', 'current'])
  })

  it('avanza, retrocede y no se pasa de largo', () => {
    let state = initialState(STEPS)
    state = next(state)
    expect(state.index).toBe(1)
    state = back(state)
    expect(state.index).toBe(0)
    expect(back(state).index).toBe(0)
  })

  it('el último paso cierra el wizard (y cerrar es idempotente)', () => {
    let state = goTo(initialState(STEPS), 2)
    expect(progressOf(state).isLast).toBe(true)
    state = next(state)
    expect(state.status).toBe('done')
    expect(shouldShow(state)).toBe(false)
    expect(finish(state)).toBe(state)
  })

  it('omitir lo marca como visto: no se vuelve a abrir solo', () => {
    const state = finish(initialState(STEPS))
    expect(state.status).toBe('done')
    expect(shouldShow(state)).toBe(false)
  })

  it('retroceder desde el último paso NO lo cierra', () => {
    const state = goTo(initialState(STEPS), 2)
    expect(back(state).status).toBe('running')
  })

  it('reabrir vuelve al paso 0 sin perder lo visitado', () => {
    const done = finish(goTo(initialState(STEPS), 2))
    const again = reopen(done)
    expect(again.index).toBe(0)
    expect(again.status).toBe('running')
    expect(again.visited).toBe(2)
  })

  it('`withSteps` reajusta cuando el catálogo cambia en runtime', () => {
    const state = goTo(initialState(['a', 'b', 'c']), 2)
    const shrunk = withSteps(state, ['a'])
    expect(shrunk.index).toBe(0)
    expect(shrunk.visited).toBe(0)
  })

  it('sin pasos no hay nada que mostrar y avanzar cierra', () => {
    const empty = initialState([], null, 3)
    expect(shouldShow(empty)).toBe(false)
    expect(progressOf(empty).current).toBe(0)
    expect(next(empty).status).toBe('done')
  })
})

describe('registry de pasos', () => {
  const makeStep = (id: string, order?: number): OnboardingStep => ({
    id,
    label: id,
    title: id,
    subtitle: '',
    icon: 'home',
    kind: 'fake',
    ...(order === undefined ? {} : { order }),
    component: () => null
  })

  it('ordena por `order` y desempata por id (estable)', () => {
    _resetOnboardingRegistryForTests()
    registerOnboardingStep(makeStep('z', 10))
    registerOnboardingStep(makeStep('a', 10))
    registerOnboardingStep(makeStep('m', 5))
    registerOnboardingStep(makeStep('s', 100))
    expect(getOnboardingStepIds()).toEqual(['m', 'a', 'z', 's'])

    unregisterOnboardingStep('m')
    expect(getOnboardingStepIds()).toEqual(['a', 'z', 's'])
    _resetOnboardingRegistryForTests()
  })

  it('avisa a los suscriptores (y la baja deja de avisar)', () => {
    _resetOnboardingRegistryForTests()
    let calls = 0
    const unsubscribe = subscribeToOnboardingSteps(() => {
      calls += 1
    })
    const unregister = registerOnboardingStep(makeStep('x'))
    expect(calls).toBe(1)
    unregister()
    expect(calls).toBe(2)
    unsubscribe()
    registerOnboardingStep(makeStep('y'))
    expect(calls).toBe(2)
    _resetOnboardingRegistryForTests()
  })
})

// ── Catálogo declarado en steps/index.ts ───────────────────────────────────

interface CatalogEntry {
  id: string
  kind: string
  component: string
  order: number
}

function readCatalog(): { entries: CatalogEntry[]; componentDirs: Map<string, string> } {
  const source = fs.readFileSync(path.join(STEPS_DIR, 'index.ts'), 'utf-8')

  const componentDirs = new Map<string, string>()
  for (const match of source.matchAll(
    /import\s*\{\s*(\w+)\s*\}\s*from\s*'\.\/(fake|real)\/(\w+)'/g
  )) {
    componentDirs.set(match[1], match[2])
  }

  const arrayBody = source.slice(
    source.indexOf('BUILTIN_ONBOARDING_STEPS'),
    source.indexOf('let registered')
  )
  const entries: CatalogEntry[] = []
  for (const chunk of arrayBody.split('\n  {')) {
    const id = chunk.match(/id:\s*'([^']+)'/)
    const kind = chunk.match(/kind:\s*'([^']+)'/)
    const component = chunk.match(/component:\s*(\w+)/)
    const order = chunk.match(/order:\s*(\d+)/)
    if (!id || !kind || !component || !order) continue
    entries.push({ id: id[1], kind: kind[1], component: component[1], order: Number(order[1]) })
  }
  return { entries, componentDirs }
}

describe('catálogo builtin (steps/index.ts)', () => {
  const { entries, componentDirs } = readCatalog()

  it('declara al menos un paso de cada tipo', () => {
    expect(entries.length).toBeGreaterThanOrEqual(4)
    const kinds = new Set(entries.map((entry) => entry.kind))
    expect(kinds.has('fake')).toBe(true)
    expect(kinds.has('real')).toBe(true)
    expect([...kinds].every((kind) => kind === 'fake' || kind === 'real')).toBe(true)
  })

  it('no repite ids y mantiene el orden de aparición creciente', () => {
    const ids = entries.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    const orders = entries.map((entry) => entry.order)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })

  it('el `kind` declarado coincide con la CARPETA del componente', () => {
    for (const entry of entries) {
      const dir = componentDirs.get(entry.component)
      expect(dir, `el paso "${entry.id}" importa ${entry.component}, que no viene de steps/`).toBeDefined()
      expect(dir).toBe(entry.kind)
    }
  })

  it('cada componente declarado existe en disco', () => {
    for (const [component, dir] of componentDirs) {
      const found = fs
        .readdirSync(path.join(STEPS_DIR, dir), { withFileTypes: true })
        .some((entry) => entry.name === `${component}.tsx`)
      expect(found, `falta steps/${dir}/${component}.tsx`).toBe(true)
    }
  })
})

// ── Pureza: la maqueta no puede tocar la app real ──────────────────────────

/** Imports de un paso FAKE: UI propia, iconos y React. Nada más. */
const FAKE_ALLOWED = [/^react$/, /^\.\.?\//, /\.css$/, /^@services\/productIcons(\/|$)/]

/** Un paso REAL sí toca servicios, primitivas UI y storage. */
const REAL_ALLOWED = [/^react$/, /^\.\.?\//, /\.css$/, /^@ui(\/|$)/, /^@services\//]

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

function importsOf(file: string): string[] {
  const source = fs.readFileSync(file, 'utf-8')
  return [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
}

/** Archivos que violan el allowlist de su carpeta. */
function offendersIn(dir: string, allowed: RegExp[]): string[] {
  const offenders: string[] = []
  for (const file of sourceFiles(dir)) {
    for (const specifier of importsOf(file)) {
      if (!allowed.some((rule) => rule.test(specifier))) {
        offenders.push(`${path.relative(FEATURE, file)} → ${specifier}`)
      }
    }
  }
  return offenders
}

describe('pureza de los pasos', () => {
  it('los pasos fake solo importan UI propia, iconos y React', () => {
    expect(offendersIn(path.join(STEPS_DIR, 'fake'), FAKE_ALLOWED)).toEqual([])
  })

  it('los pasos reales siguen dentro de su allowlist', () => {
    expect(offendersIn(path.join(STEPS_DIR, 'real'), REAL_ALLOWED)).toEqual([])
  })

  it('cada paso fake rotula sus datos como DEMO', () => {
    for (const file of sourceFiles(path.join(STEPS_DIR, 'fake'))) {
      const source = fs.readFileSync(file, 'utf-8')
      // ReadyStep no declara datos: solo pinta las elecciones del wizard.
      if (/DEMO|choices\[/.test(source)) continue
      throw new Error(`${path.relative(FEATURE, file)} no rotula sus datos como DEMO`)
    }
  })

  it('el shell rotula el tipo de cada paso (fake = "Vista previa")', () => {
    const wizard = fs.readFileSync(
      path.join(FEATURE, 'components/OnboardingWizard.tsx'),
      'utf-8'
    )
    // La etiqueta honesta depende del `kind` declarado por el paso.
    expect(wizard).toMatch(/current\.kind/)
    expect(wizard).toContain('Vista previa')
    expect(wizard).toContain('Se aplica ahora')
  })
})
