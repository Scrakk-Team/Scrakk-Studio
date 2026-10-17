// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Motor de RENDER de eventos (efectos visuales).
 *
 * Un evento `.sef` declara una ESCENA (ver `@shared/events/types`) y el runtime
 * traduce sus ops a llamadas acá. El motor NO sabe qué es un murciélago: sabe
 * "emitir una forma por un camino". La forma viaja en el pack.
 *
 * Modelo de ejecución:
 * - El ESTADO del stage (fog / tint / vignette / shake) vive acá y lo LEE el
 *   overlay por React/CSS. Es barato: un número y un color.
 * - Las PARTÍCULAS las dibuja el propio motor en un canvas.
 * - Un único `requestAnimationFrame` corre SÓLO mientras hay algo animándose
 *   (partículas vivas o shake cayendo) y se apaga solo al quedar idle. Nunca
 *   arranca si el entorno no tiene rAF (tests jsdom).
 *
 * Singleton de módulo con `subscribe`/`emit`, igual que `@services/perf`.
 */

import type { EventMotion, EventShape } from '@shared/events/types'
import { isLowEndMode } from '@services/perf'

/** Tope DURO de partículas vivas. En modo PC mala se usa la mitad. */
export const MAX_PARTICLES = 120

type Listener = () => void

/** Viewport en px sobre el que se resuelven las unidades de `EventMotion`. */
export interface EffectViewport {
  w: number
  h: number
}

/** Lo que el overlay lee para pintar fog/tint/vignette/shake. */
export interface EffectStage {
  fog: number
  tint: string | null
  tintAmount: number
  vignette: number
  shake: number
}

/** Fades por canal (ms) — el overlay los usa como `transition-duration`. */
export interface EffectStageFade {
  fog: number
  tint: number
  vignette: number
}

/** Especificación de un `emit` (una tanda de partículas). */
export interface EffectEmitSpec {
  shape: EventShape
  count?: number
  motion?: EventMotion
  jitter?: number
  /** 0..1: dispersión del punto de llegada (un grupo se abre). */
  spread?: number
  /** Grados de inclinación hacia donde viaja (0 = rígido). */
  bank?: number
  /**
   * Curva de opacidad: `fade` (default) entra y sale; `flash` aparece de golpe y
   * se apaga — es lo que quiere un rayo o una chispa, no un bicho.
   */
  alpha?: 'fade' | 'flash'
  size?: number
  rotate?: number
  flapHz?: number
  life?: number
  every?: number
}

// ── Tokens de color del tema ────────────────────────────────────────────
// Un color puede ser un token conocido del tema o un color CSS crudo. Los
// tokens viven en variables CSS de `:root` (`--color-accent`, etc.).
const TOKEN_VARS: Record<string, string> = {
  accent: '--color-accent',
  text: '--color-text',
  textMuted: '--color-text-muted',
  textSecondary: '--color-text-secondary',
  border: '--color-border',
  bg: '--color-bg',
  surface: '--color-surface',
  error: '--color-danger',
  warning: '--color-warning',
  success: '--color-success',
  info: '--color-info'
}

/**
 * Resuelve un color del spec: si es un token del tema lee la variable CSS
 * computada de `document.documentElement`; si no, lo trata como color CSS. Sin
 * DOM (tests) devuelve la expresión `var(...)` para no romper.
 */
export function resolveEffectColor(value: string): string {
  const raw = value.trim()
  const varName = TOKEN_VARS[raw]
  if (!varName) return value
  try {
    if (typeof document !== 'undefined' && typeof getComputedStyle === 'function') {
      const computed = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
      if (computed) return computed
    }
  } catch {
    // Sin DOM: cae al `var(...)` de abajo.
  }
  return `var(${varName})`
}

/**
 * Convierte un punto del spec a px. Un número es px; un string admite `vw`,
 * `vh` y `%` (el `%` de un eje usa la dimensión de ESE eje).
 */
export function parsePoint(
  value: number | string,
  axis: 'x' | 'y',
  viewport: EffectViewport
): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const text = value.trim()
  if (text.endsWith('vw')) return (parseFloat(text) / 100) * viewport.w
  if (text.endsWith('vh')) return (parseFloat(text) / 100) * viewport.h
  if (text.endsWith('%')) {
    return (parseFloat(text) / 100) * (axis === 'x' ? viewport.w : viewport.h)
  }
  const parsed = parseFloat(text)
  return Number.isFinite(parsed) ? parsed : 0
}

// ── Accesibilidad: movimiento reducido ──────────────────────────────────
// Se lee UNA vez (cacheado). `resetEffectsForTests` invalida el cache para que
// los tests puedan stubbear `window.matchMedia` y volver a preguntar.
let reducedMotionCache: boolean | null = null

export function prefersReducedMotion(): boolean {
  if (reducedMotionCache !== null) return reducedMotionCache
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      reducedMotionCache = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } else {
      reducedMotionCache = false
    }
  } catch {
    reducedMotionCache = false
  }
  return reducedMotionCache
}

// ── Easing ──────────────────────────────────────────────────────────────
type EasingFn = (t: number) => number

function easeLinear(t: number): number {
  return t
}

function easeIn(t: number): number {
  return t * t
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) * (-2 * t + 2) / 2
}

function resolveEasing(name: EventMotion['easing']): EasingFn {
  switch (name) {
    case 'ease':
      return easeInOut
    case 'ease-in':
      return easeIn
    case 'ease-out':
      return easeOut
    case 'linear':
    default:
      return easeLinear
  }
}

// ── Formas compiladas (Path2D) ──────────────────────────────────────────
interface CompiledShape {
  path: Path2D
  /** El ala (una sola: la derecha). El motor dibuja su espejo. */
  wing: Path2D | null
  /** Hombro del ala, en unidades del viewBox. */
  anchor: [number, number]
  viewBox: [number, number]
  width: number
}

// Cache por `viewBox|d`: un pack emite 50 veces la misma forma y no queremos
// compilar el `Path2D` 50 veces.
const shapeCache = new Map<string, CompiledShape>()

function compileShape(shape: EventShape): CompiledShape | null {
  // Sin Path2D (tests jsdom) no dibujamos, pero el resto del motor sigue vivo.
  if (typeof Path2D === 'undefined') return null
  const viewBox: [number, number] = shape.viewBox ?? [1, 1]
  const key = `${viewBox[0]}x${viewBox[1]}|${shape.wing ?? ''}|${shape.path}`
  const cached = shapeCache.get(key)
  if (cached) return cached
  try {
    const compiled: CompiledShape = {
      path: new Path2D(shape.path),
      wing: shape.wing ? new Path2D(shape.wing) : null,
      // Sin hombro explícito, el centro de la forma: es donde se "agarra" el ala
      // cuando el pack no lo precisa.
      anchor: shape.wingAnchor ?? [viewBox[0] / 2, viewBox[1] / 2],
      viewBox,
      width: shape.width ?? 1
    }
    shapeCache.set(key, compiled)
    return compiled
  } catch {
    return null
  }
}

// ── Pool de partículas ──────────────────────────────────────────────────
interface Particle {
  active: boolean
  shape: CompiledShape | null
  fill: string
  stroke: string | null
  x0: number
  y0: number
  x1: number
  y1: number
  /** Punto de control del arco (NaN = va derecho). */
  cx: number
  cy: number
  hasArc: boolean
  driftX: number
  driftY: number
  jitterX: number
  jitterY: number
  /** Vaivén vertical del vuelo. */
  bobAmp: number
  bobHz: number
  phase: number
  bank: number
  /** `true` = opacidad "flash" (de golpe y se apaga), no fade in/out. */
  alphaFlash: boolean
  scale: number
  rotate0: number
  flapHz: number
  seed: number
  delay: number
  t: number
  life: number
  easing: EasingFn
}

function makeParticle(): Particle {
  return {
    active: false,
    shape: null,
    fill: '#ffffff',
    stroke: null,
    x0: 0,
    y0: 0,
    x1: 0,
    y1: 0,
    cx: 0,
    cy: 0,
    hasArc: false,
    driftX: 0,
    driftY: 0,
    jitterX: 0,
    jitterY: 0,
    bobAmp: 0,
    bobHz: 1.5,
    phase: 0,
    bank: 0,
    alphaFlash: false,
    scale: 1,
    rotate0: 0,
    flapHz: 0,
    seed: 0,
    delay: 0,
    t: 0,
    life: 6000,
    easing: easeLinear
  }
}

// Pool module-level: NUNCA se asigna un array nuevo por frame.
const pool: Particle[] = []

function ensurePool(): void {
  while (pool.length < MAX_PARTICLES) pool.push(makeParticle())
}

/** Cuántas partículas se permiten AHORA (modo PC mala → mitad). */
function effectiveCap(): number {
  return isLowEndMode() ? Math.floor(MAX_PARTICLES / 2) : MAX_PARTICLES
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

// ── Estado del singleton ────────────────────────────────────────────────
const listeners = new Set<Listener>()

const stage: EffectStage = {
  fog: 0,
  tint: null,
  tintAmount: 0,
  vignette: 0,
  shake: 0
}

const stageFade: EffectStageFade = { fog: 0, tint: 0, vignette: 0 }

let fogTint: string | null = null
let intensity = 1
let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let viewport: EffectViewport = { w: 0, h: 0 }
let running = false
let rafHandle = 0
let lastFrame = 0

// Shake: amplitud + tiempo restante; decae linealmente en el tick.
let shakeIntensity = 0
let shakeDuration = 0
let shakeTimeLeft = 0

function notify(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // Un suscriptor roto no debe tumbar a los demás.
    }
  }
}

function measureViewport(): EffectViewport {
  if (canvas) {
    const w = canvas.clientWidth || canvas.width || 0
    const h = canvas.clientHeight || canvas.height || 0
    if (w || h) return { w, h }
  }
  try {
    if (typeof window !== 'undefined') {
      return { w: window.innerWidth || 0, h: window.innerHeight || 0 }
    }
  } catch {
    // sin window
  }
  return { w: 0, h: 0 }
}

function resizeCanvas(): void {
  if (!canvas) return
  viewport = measureViewport()
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
  canvas.width = Math.max(1, Math.round(viewport.w * dpr))
  canvas.height = Math.max(1, Math.round(viewport.h * dpr))
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function scheduleFrame(cb: FrameRequestCallback): number {
  if (typeof requestAnimationFrame !== 'function') return 0
  return requestAnimationFrame(cb)
}

function startLoop(): void {
  if (running) return
  // Sin rAF (jsdom) el estado sigue funcionando, pero no hay bucle de dibujo.
  if (typeof requestAnimationFrame !== 'function') return
  running = true
  lastFrame = 0
  rafHandle = scheduleFrame(tick)
}

function stopLoop(): void {
  if (rafHandle && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafHandle)
  rafHandle = 0
  running = false
  lastFrame = 0
}

function hasLiveParticles(): boolean {
  for (const p of pool) {
    if (p.active) return true
  }
  return false
}

/** Cuánto gira el ala en cada extremo del aleteo, en grados. */
export const WING_SWING_DEG = 22

/**
 * Fotograma del aleteo de una partícula.
 *
 * Devuelve la inclinación del CUERPO (`rotation`, que es la que pidió la
 * escena) y el ángulo del **ALA**. El cuerpo NO se mueve al aletear: sólo gira
 * el ala, alrededor del hombro.
 *
 * Eso no es un detalle estético. Mover la forma entera hace que un silueto
 * simétrico (un bicho visto de frente) se lea como una mariposa revoloteando, y
 * además se nota de inmediato: "se mueve incluso su parte de cuerpo, cuando sólo
 * deberían moverse las alas".
 */
export function flapFrame(
  flapHz: number,
  tMs: number,
  rotate0 = 0
): { rotation: number; wingAngle: number } {
  if (flapHz <= 0) return { rotation: rotate0, wingAngle: 0 }
  const phase = Math.sin((tMs / 1000) * Math.PI * 2 * flapHz)
  return { rotation: rotate0, wingAngle: phase * WING_SWING_DEG }
}

function draw(): void {
  if (!ctx) return
  ctx.clearRect(0, 0, viewport.w, viewport.h)
  for (const p of pool) {
    if (!p.active || p.t < 0) continue
    const k = clamp01(p.t / p.life)
    const eased = p.easing(k)

    // Posición: arco (cuadrática) si el pack dio un `through`, si no recta.
    let x: number
    let y: number
    let dx: number
    let dy: number
    if (p.hasArc) {
      const u = 1 - eased
      x = u * u * p.x0 + 2 * u * eased * p.cx + eased * eased * p.x1
      y = u * u * p.y0 + 2 * u * eased * p.cy + eased * eased * p.y1
      dx = 2 * u * (p.cx - p.x0) + 2 * eased * (p.x1 - p.cx)
      dy = 2 * u * (p.cy - p.y0) + 2 * eased * (p.y1 - p.cy)
    } else {
      x = p.x0 + (p.x1 - p.x0) * eased
      y = p.y0 + (p.y1 - p.y0) * eased
      dx = p.x1 - p.x0
      dy = p.y1 - p.y0
    }
    x += p.jitterX + (p.driftX * p.t) / 1000
    y += p.jitterY + (p.driftY * p.t) / 1000
    // Vaivén del vuelo: lo que hace que un bicho no viaje como un tronco.
    if (p.bobAmp > 0) {
      y += Math.sin((p.t / 1000) * Math.PI * 2 * p.bobHz + p.phase) * p.bobAmp
    }

    const alpha = p.alphaFlash
      ? // Rayo/chispa: opaco mientras dura y se apaga al final. Entrar con fade
        // lo hace ver blando (un relámpago no "aparece de a poco").
        k < 0.6
        ? 1
        : Math.max(0, 1 - (k - 0.6) / 0.4)
      : Math.min(1, Math.sin(k * Math.PI) * 1.6)
    if (alpha <= 0) continue

    const flap = flapFrame(p.flapHz, p.t, p.rotate0)
    // Banqueo: se inclina hacia donde viaja (0 = nunca).
    const pitch = p.bank > 0 ? (Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI : 0
    const rotation = flap.rotation + pitch * (p.bank / 60)

    ctx.save()
    ctx.translate(x, y)
    if (rotation) ctx.rotate((rotation * Math.PI) / 180)
    ctx.globalAlpha = alpha
    if (p.shape) {
      // `scale` deja la ALTURA dibujada en `size` px (viewBox normaliza).
      const vbW = p.shape.viewBox[0]
      const vbH = p.shape.viewBox[1] || 1
      const s = p.scale / vbH
      ctx.scale(s, s)
      // La forma se dibuja CENTRADA en el punto de la partícula: el viewBox es
      // un sistema de coordenadas propio, no un offset en pantalla. Después de
      // esto, las coordenadas del viewBox valen tal cual.
      ctx.translate(-vbW / 2, -vbH / 2)
      ctx.fillStyle = p.fill
      ctx.fill(p.shape.path)
      if (p.shape.wing) {
        // El ala: derecha y su espejo, girando alrededor del hombro. Es la
        // ÚNICA parte que se mueve con `flapHz`.
        const [ax, ay] = p.shape.anchor
        for (const side of [1, -1] as const) {
          ctx.save()
          ctx.translate(ax, ay)
          ctx.scale(side, 1)
          ctx.rotate((flap.wingAngle * side * Math.PI) / 180)
          ctx.translate(-ax, -ay)
          ctx.fill(p.shape.wing)
          ctx.restore()
        }
      }
      if (p.stroke) {
        ctx.strokeStyle = p.stroke
        ctx.lineWidth = (p.shape.width || 1) / s
        ctx.stroke(p.shape.path)
        if (p.shape.wing) {
          const [ax, ay] = p.shape.anchor
          for (const side of [1, -1] as const) {
            ctx.save()
            ctx.translate(ax, ay)
            ctx.scale(side, 1)
            ctx.rotate((flap.wingAngle * side * Math.PI) / 180)
            ctx.translate(-ax, -ay)
            ctx.stroke(p.shape.wing)
            ctx.restore()
          }
        }
      }
    } else {
      // Fallback sin forma: un círculo del tamaño pedido (y tests sin Path2D).
      ctx.fillStyle = p.fill
      ctx.beginPath()
      ctx.arc(0, 0, Math.max(1, p.scale / 2), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
  ctx.globalAlpha = 1
}

function tick(now: number): void {
  const dt = lastFrame === 0 ? 16 : Math.min(64, now - lastFrame)
  lastFrame = now

  // Shake: cae linealmente hasta 0 y avisa a React mientras dura.
  let changed = false
  if (shakeTimeLeft > 0) {
    shakeTimeLeft = Math.max(0, shakeTimeLeft - dt)
    const value = shakeDuration > 0 ? shakeIntensity * (shakeTimeLeft / shakeDuration) : 0
    if (value !== stage.shake) {
      stage.shake = value
      changed = true
    }
  }

  for (const p of pool) {
    if (!p.active) continue
    p.t += dt
    if (p.t > p.life) p.active = false
  }

  draw()
  if (changed) notify()

  if (hasLiveParticles() || shakeTimeLeft > 0) {
    rafHandle = scheduleFrame(tick)
  } else {
    rafHandle = 0
    running = false
    lastFrame = 0
    notify()
  }
}

function acquire(): Particle | null {
  ensurePool()
  const cap = effectiveCap()
  for (let i = 0; i < cap; i += 1) {
    if (!pool[i].active) return pool[i]
  }
  return null
}

function spawn(spec: EffectEmitSpec, emittedAt: number): void {
  if (prefersReducedMotion()) return
  const scale = clamp01(emittedAt) * clamp01(intensity)
  const baseCount = Math.max(0, Math.floor(spec.count ?? 1))
  // Una partícula suelta no puede desaparecer por redondeo: con `count: 1` y
  // intensidad 0.5, `Math.round(0.5)` daba 0 y el rayo NUNCA se dibujaba.
  const raw = baseCount * scale
  const count = raw > 0 ? Math.max(1, Math.round(raw)) : 0
  if (count <= 0) return

  const vp = canvas ? measureViewport() : viewport
  const shape = compileShape(spec.shape)
  const fill = resolveEffectColor(spec.shape.fill ?? 'accent')
  const stroke = spec.shape.stroke ? resolveEffectColor(spec.shape.stroke) : null
  const drawSize = spec.size ?? 1
  const life = spec.life ?? 6000
  const every = spec.every ?? 0
  const jitter = clamp01(spec.jitter ?? 0)
  const spread = clamp01(spec.spread ?? 0)
  const bank = spec.bank ?? 0
  const flapHz = spec.flapHz ?? 0
  const rotate = spec.rotate ?? 0
  const easing = resolveEasing(spec.motion?.easing)
  const from = spec.motion?.from
  const to = spec.motion?.to
  const through = spec.motion?.through
  const bobAmp = spec.motion?.bob ?? 0
  const bobHz = spec.motion?.bobHz ?? 1.5
  const drift = spec.motion?.drift ?? [0, 0]
  const vbH = spec.shape.viewBox?.[1] ?? 1
  const drawHeight = vbH * drawSize

  for (let i = 0; i < count; i += 1) {
    const p = acquire()
    if (!p) break // tope alcanzado: el resto se descarta
    const defaultFromX = vp.w / 2
    const defaultFromY = vp.h + drawHeight
    const fromX = from ? parsePoint(from[0], 'x', vp) : defaultFromX
    const fromY = from ? parsePoint(from[1], 'y', vp) : defaultFromY
    const toXBase = to ? parsePoint(to[0], 'x', vp) : fromX
    const toYBase = to ? parsePoint(to[1], 'y', vp) : -drawHeight
    // Dispersión: cada uno termina en un lugar distinto (si no, se pisan todos
    // en el mismo punto y el grupo parece una fila de hormigas).
    const toX = toXBase + (Math.random() * 2 - 1) * spread * vp.w * 0.22
    const toY = toYBase + (Math.random() * 2 - 1) * spread * vp.h * 0.12

    // El camino: si el pack dio un `through`, ese manda. Si no, se ABOMBA solo
    // un poco (aleatorio, hacia un lado u otro). Una recta perfecta se lee como
    // algo mecánico: ningún bicho vuela en línea.
    const mx = (fromX + toX) / 2
    const my = (fromY + toY) / 2
    let cx = through ? parsePoint(through[0], 'x', vp) : mx
    let cy = through ? parsePoint(through[1], 'y', vp) : my
    if (!through) {
      const nx = -(toY - fromY)
      const ny = toX - fromX
      const len = Math.hypot(nx, ny) || 1
      const bow = (Math.random() * 2 - 1) * 0.25 * len
      cx = mx + (nx / len) * bow
      cy = my + (ny / len) * bow
    }

    p.active = true
    p.shape = shape
    p.fill = fill
    p.stroke = stroke
    p.x0 = fromX
    p.y0 = fromY
    p.x1 = toX
    p.y1 = toY
    p.cx = cx
    p.cy = cy
    p.hasArc = true
    p.driftX = drift[0]
    p.driftY = drift[1]
    p.jitterX = (Math.random() * 2 - 1) * jitter * vp.w
    p.jitterY = (Math.random() * 2 - 1) * jitter * vp.h
    p.bobAmp = bobAmp
    p.bobHz = bobHz
    p.phase = Math.random() * Math.PI * 2
    p.bank = bank
    p.alphaFlash = (spec.alpha ?? 'fade') === 'flash'
    p.scale = drawSize
    p.rotate0 = (Math.random() * 2 - 1) * rotate
    p.flapHz = flapHz
    p.seed = Math.random()
    p.delay = i * every
    p.t = -p.delay
    p.life = life
    p.easing = easing
  }
}

// ── API pública (singleton) ─────────────────────────────────────────────
/**
 * Estado del stage + motor de partículas. Métodos puros de estado; el overlay
 * lo lee y el runtime de eventos lo maneja.
 */
export const engine = {
  /** El overlay entrega/retira su canvas. `null` al desmontar. */
  registerCanvas(next: HTMLCanvasElement | null): void {
    canvas = next
    ctx = null
    if (next) {
      try {
        ctx = next.getContext('2d')
      } catch {
        ctx = null
      }
      resizeCanvas()
    }
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  /**
   * Doble uso: `emit()` sin args avisa a los suscriptores; `emit(spec, scale)`
   * dispara una tanda de partículas. (El op del runtime y el notifier del store
   * comparten nombre a propósito, ver contrato del motor.)
   */
  emit(spec?: EffectEmitSpec, intensityScale = 1): void {
    if (!spec) {
      notify()
      return
    }
    spawn(spec, intensityScale)
    if (hasLiveParticles()) startLoop()
    notify()
  },

  isRunning(): boolean {
    return running
  },

  /** Copia del estado legible por el overlay (fog/tint/vignette/shake). */
  getStage(): EffectStage {
    return {
      fog: stage.fog,
      tint: stage.tint,
      tintAmount: stage.tintAmount,
      vignette: stage.vignette,
      shake: stage.shake
    }
  },

  /** Fades por canal, para el `transition-duration` inline del overlay. */
  getStageFade(): EffectStageFade {
    return { fog: stageFade.fog, tint: stageFade.tint, vignette: stageFade.vignette }
  },

  /** Color actual de la niebla (token resuelto o color CSS). */
  getFogTint(): string | null {
    return fogTint
  },

  /** Partículas vivas AHORA (incluye las que esperan su `every`). */
  getParticleCount(): number {
    let count = 0
    for (const p of pool) {
      if (p.active) count += 1
    }
    return count
  },

  /** Intensidad global 0..1 (la `intensity` de la escena). */
  setIntensity(value: number): void {
    intensity = clamp01(value)
  },

  setFog(amount: number, tint: string | null = null, fadeMs = 1200): void {
    stage.fog = clamp01(amount * intensity)
    fogTint = tint ? resolveEffectColor(tint) : null
    stageFade.fog = fadeMs
    notify()
  },

  setTint(color: string, amount: number, fadeMs = 1200): void {
    stage.tint = resolveEffectColor(color)
    stage.tintAmount = clamp01(amount * intensity)
    stageFade.tint = fadeMs
    notify()
  },

  setVignette(amount: number, fadeMs = 1200): void {
    stage.vignette = clamp01(amount * intensity)
    stageFade.vignette = fadeMs
    notify()
  },

  shake(intensityPx = 3, durationMs = 400): void {
    if (prefersReducedMotion()) return
    shakeIntensity = intensityPx
    shakeDuration = Math.max(1, durationMs)
    shakeTimeLeft = shakeDuration
    stage.shake = intensityPx
    startLoop()
    notify()
  },

  /** Fade out del stage + limpia partículas. `fadeMs` 0 = inmediato. */
  clear(fadeMs = 0): void {
    stage.fog = 0
    stage.tint = null
    stage.tintAmount = 0
    stage.vignette = 0
    stage.shake = 0
    fogTint = null
    shakeTimeLeft = 0
    shakeDuration = 0
    shakeIntensity = 0
    stageFade.fog = fadeMs
    stageFade.tint = fadeMs
    stageFade.vignette = fadeMs
    for (const p of pool) p.active = false
    if (ctx) ctx.clearRect(0, 0, viewport.w, viewport.h)
    stopLoop()
    notify()
  }
}

/** Solo tests: resetea el singleton a su estado inicial. */
export function resetEffectsForTests(): void {
  stage.fog = 0
  stage.tint = null
  stage.tintAmount = 0
  stage.vignette = 0
  stage.shake = 0
  stageFade.fog = 0
  stageFade.tint = 0
  stageFade.vignette = 0
  fogTint = null
  intensity = 1
  shakeIntensity = 0
  shakeDuration = 0
  shakeTimeLeft = 0
  for (const p of pool) p.active = false
  listeners.clear()
  canvas = null
  ctx = null
  viewport = { w: 0, h: 0 }
  reducedMotionCache = null
  stopLoop()
}
