// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Contrato de performance — compartido (main + renderer).
 *
 * Este es el ÚNICO archivo de perf que el código de producto importa.
 * El próximo framework de destino (no Electron) reimplementa este módulo
 * con la misma API y nada del código de producto cambia.
 *
 * Diseño:
 * - Sin imports de Electron, sin imports de Node (solo tipos y globals).
 * - Flags con defaults seguros. Overridable por env (main) o por
 *   storage (renderer) según corresponda.
 * - `mark/measure` y `now` usan el global `performance` cuando está
 *   disponible; caen a `Date.now()` si no.
 *
 * El plan vive en /home/julian/.scrakk/sessions/.../plan.md
 */

export type PerfProfile = 'dev' | 'prod'

/**
 * Flags granulares. Cada uno es independiente para que se pueda
 * activar/desactivar sin tocar a los demás. Los defaults son
 * conservadores (poco overhead) salvo que se indique lo contrario.
 */
export interface PerfFlags {
  /** Log de fases de startup en consola. */
  logStartup: boolean
  /** Log de timings arbitrarios via mark/measure. */
  logTiming: boolean
  /** Log de longtasks del renderer (PerformanceObserver). Solo dev. */
  logLongTasks: boolean
  /** why-did-you-render: instrumenta React para detectar re-renders. */
  wdyr: boolean
  /** Drop de console.* en bundle de prod. Honrado por el plugin de build. */
  dropConsoleInProd: boolean
  /** Mover el chequeo de updates a post-window (no bloquea el primer paint). */
  deferUpdatesCheck: boolean
  /** Coalesce de eventos fs.watch por N ms antes de enviarlos al renderer. */
  coalesceWatchEvents: boolean
  /** utilityProcess para SEF zip/unzip (separar del main process). */
  sefIoWorker: boolean
  /** utilityProcess para fs.search en workspaces grandes. */
  fsSearchWorker: boolean
  /** Streaming compile del WASM (WebAssembly.compileStreaming). */
  wasmStreamingCompile: boolean
  /** Comprimir WASM con brotli/gzip en el build. */
  compressWasm: boolean
  /**
   * Limitar memoria V8 con `--max-old-space-size`.
   *
   * OJO: `--js-flags` se propaga a TODOS los procesos, incluido el renderer.
   * Dejarlo activo con 256 MB mataba el renderer (V8 OOM) al abrir varios
   * archivos. Por eso queda **opt-in** (default false).
   */
  capMainHeap: boolean
  /** React.lazy sobre modales (Settings/LSP/Providers). */
  lazyModals: boolean
  /** manualChunks declarativo en prod. */
  manualChunks: boolean
  /** CSS contain: strict en paneles estáticos. */
  cssContain: boolean
  /** Background del BrowserWindow leído del storage (no hardcode). */
  dynamicWindowBackground: boolean
  /** V8 code cache (--js-flags related). */
  v8CodeCache: boolean
}

/** Defaults — todos en false salvo los que son 0 costo. */
export const PERF_DEFAULTS: PerfFlags = {
  logStartup: false,
  logTiming: false,
  logLongTasks: false,
  wdyr: false,
  dropConsoleInProd: true,
  deferUpdatesCheck: true,
  coalesceWatchEvents: true,
  sefIoWorker: true,
  fsSearchWorker: false,
  wasmStreamingCompile: true,
  compressWasm: true,
  capMainHeap: false,
  lazyModals: true,
  manualChunks: true,
  cssContain: true,
  dynamicWindowBackground: true,
  v8CodeCache: true
}

/**
 * Resuelve el perfil actual sin importar el framework:
 *  - main: lee `process.env.NODE_ENV` (Electron lo setea en prod builds).
 *  - renderer: usa `import.meta.env.MODE` (Vite). Fallback `dev` si no está.
 *  - cualquier lado: el caller puede pasar override.
 */
export function resolvePerfProfile(override?: PerfProfile): PerfProfile {
  if (override === 'dev' || override === 'prod') return override
  const env = readEnvRecord()
  if (env && env['NODE_ENV'] === 'production') return 'prod'
  // import.meta.env existe solo en build con Vite. Guard para SSR / tests.
  try {
    const meta = (import.meta as { env?: { MODE?: string } }).env
    if (meta?.MODE === 'production') return 'prod'
  } catch {
    // import.meta no disponible: queda dev
  }
  return 'dev'
}

/**
 * Lee un boolean de env con prefijo SCRAKK_PERF_.
 * Ej: SCRAKK_PERF_LOG_STARTUP=1 → logStartup=true.
 * Acepta: '1', 'true', 'yes' (case-insensitive) como true.
 */
export function readEnvFlag(name: keyof PerfFlags): boolean {
  const env = readEnvRecord()
  if (!env) return PERF_DEFAULTS[name]
  const raw = env[`SCRAKK_PERF_${envKey(name)}`]
  if (raw === undefined) return PERF_DEFAULTS[name]
  return /^(1|true|yes|on)$/i.test(raw)
}

/**
 * Devuelve el record de env del proceso actual, o null si no hay
 * (renderer en algunos sandboxes, browser puro, tests jsdom).
 * Portable: en vez de `typeof process` (que rompe en web estricto),
 * mira si existe `globalThis.process` o `globalThis.__env__` (tests).
 *
 * Si ambos existen (caso típico: Node 24 con tests que inyectan
 * `__env__` para simular configs), `__env__` gana: permite que los
 * tests sean deterministas sin tener que mutar `process.env`.
 */
function readEnvRecord(): Record<string, string | undefined> | null {
  const g = globalThis as {
    process?: { env?: Record<string, string | undefined> }
    __env__?: Record<string, string | undefined>
  }
  if (g.__env__) return g.__env__
  if (g.process && g.process.env) return g.process.env
  return null
}

function envKey(name: keyof PerfFlags): string {
  // Convención Unix env vars: MAYÚSCULAS_CON_GUIONES. `logStartup` → `LOG_STARTUP`.
  return name.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()).toUpperCase()
}

/** Performance.now con fallback a Date.now. */
export function perfNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

/**
 * Estructura de un evento de timing. Trivialmente serializable para
 * que main y renderer puedan enviar reportes por IPC o postMessage.
 */
export interface TimingEntry {
  name: string
  startMs: number
  durationMs: number
  meta?: Record<string, string | number | boolean>
}

/** Ring buffer en memoria; tamaño acotado para no leakear. */
const TIMING_BUFFER_LIMIT = 500
const timingBuffer: TimingEntry[] = []

/** Registra un timing arbitrario. Sin side effects si logging está off. */
export function recordTiming(entry: TimingEntry): void {
  timingBuffer.push(entry)
  if (timingBuffer.length > TIMING_BUFFER_LIMIT) {
    timingBuffer.splice(0, timingBuffer.length - TIMING_BUFFER_LIMIT)
  }
}

/** Snapshot del buffer (para reportes / IPC). No lo vacía. */
export function snapshotTimings(): readonly TimingEntry[] {
  return timingBuffer.slice()
}

/** Vacía el buffer. Útil entre corridas de baseline. */
export function resetTimings(): void {
  timingBuffer.length = 0
}

/**
 * Helper sincrónico: mide cuánto tarda `fn` y lo registra si logging está on.
 * `category` es libre, sirve para filtrar (`'startup'`, `'fs'`, etc.).
 */
export function measure<T>(name: string, fn: () => T, meta?: TimingEntry['meta']): T {
  const start = perfNow()
  let err: unknown
  try {
    return fn()
  } catch (e) {
    err = e
    throw e
  } finally {
    const entry: TimingEntry = {
      name,
      startMs: start,
      durationMs: perfNow() - start,
      meta: err !== undefined ? { ...meta, error: true } : meta
    }
    recordTiming(entry)
  }
}

/** Variante async. */
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  meta?: TimingEntry['meta']
): Promise<T> {
  const start = perfNow()
  let err: unknown
  try {
    return await fn()
  } catch (e) {
    err = e
    throw e
  } finally {
    const entry: TimingEntry = {
      name,
      startMs: start,
      durationMs: perfNow() - start,
      meta: err !== undefined ? { ...meta, error: true } : meta
    }
    recordTiming(entry)
  }
}

/** Tamaño máximo del heap (--max-old-space-size) en MB, configurable. */
export function getMainHeapCapMb(): number {
  const env = readEnvRecord()
  const raw = env ? env['SCRAKK_PERF_HEAP_CAP_MB'] : undefined
  const n = raw === undefined ? 256 : Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : 256
}

/** Debounce del watch coalescing, en ms. */
export function getWatchCoalesceMs(): number {
  const env = readEnvRecord()
  const raw = env ? env['SCRAKK_PERF_WATCH_DEBOUNCE_MS'] : undefined
  const n = raw === undefined ? 50 : Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : 50
}
