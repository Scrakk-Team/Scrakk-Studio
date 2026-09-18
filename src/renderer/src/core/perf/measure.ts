/**
 * Renderer — helpers de perf que envuelven `performance.mark/measure`.
 *
 * Convenciones:
 *  - `mark(name)` registra un punto en la timeline del browser.
 *  - `measure(name, fn)` mide síncrono. `measureAsync` para promesas.
 *  - `observeLongTasks(cb)` solo se activa si el flag está on.
 *  - El código de producto **no** consulta console: si logging está on,
 *    el helper loguea él mismo.
 *
 * El reporte se puede obtener via `getLocalTimings()` o via IPC al main
 * (handler `perf:getReport` en main/perf/startup.ts).
 */

import {
  recordTiming,
  resolvePerfProfile,
  readEnvFlag,
  type TimingEntry
} from '@shared/perf'

const localTimings: TimingEntry[] = []
const LOCAL_LIMIT = 500

export function mark(name: string, meta?: TimingEntry['meta']): void {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return
  try {
    performance.mark(name, meta ? { detail: meta } : undefined)
  } catch {
    // Algunos caracteres rompen performance.mark. No fallar el flujo.
  }
}

export function measureBetween(startMark: string, endMark: string, measureName: string): number {
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') return 0
  try {
    performance.measure(measureName, startMark, endMark)
    const entries = performance.getEntriesByName(measureName)
    const last = entries[entries.length - 1]
    return last ? last.duration : 0
  } catch {
    return 0
  }
}

export function clearMarks(): void {
  if (typeof performance === 'undefined') return
  if (typeof performance.clearMarks === 'function') performance.clearMarks()
  if (typeof performance.clearMeasures === 'function') performance.clearMeasures()
}

export function measure<T>(name: string, fn: () => T, meta?: TimingEntry['meta']): T {
  const start = now()
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
      durationMs: now() - start,
      meta: err !== undefined ? { ...meta, error: true } : meta
    }
    localTimings.push(entry)
    if (localTimings.length > LOCAL_LIMIT) localTimings.splice(0, localTimings.length - LOCAL_LIMIT)
    recordTiming(entry)
    if (readEnvFlag('logTiming')) {
      // eslint-disable-next-line no-console
      console.log(`[perf/measure] ${name} = ${entry.durationMs.toFixed(2)}ms`)
    }
  }
}

export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  meta?: TimingEntry['meta']
): Promise<T> {
  const start = now()
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
      durationMs: now() - start,
      meta: err !== undefined ? { ...meta, error: true } : meta
    }
    localTimings.push(entry)
    if (localTimings.length > LOCAL_LIMIT) localTimings.splice(0, localTimings.length - LOCAL_LIMIT)
    recordTiming(entry)
    if (readEnvFlag('logTiming')) {
      // eslint-disable-next-line no-console
      console.log(`[perf/measure] ${name} = ${entry.durationMs.toFixed(2)}ms`)
    }
  }
}

export function getLocalTimings(): readonly TimingEntry[] {
  return localTimings.slice()
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

export function currentProfile(): 'dev' | 'prod' {
  return resolvePerfProfile()
}

/** Longtasks — el navegador los reporta cuando el hilo principal está ocupado >50ms. */
export interface LongTaskEntry {
  duration: number
  startTime: number
  name: string
}

export function observeLongTasks(onTask: (t: LongTaskEntry) => void): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => {}
  if (!readEnvFlag('logLongTasks')) return () => {}
  const profile = resolvePerfProfile()
  if (profile === 'prod' && !readEnvFlag('logLongTasks')) return () => {}

  let observer: PerformanceObserver | null = null
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        onTask({
          duration: entry.duration,
          startTime: entry.startTime,
          name: entry.name
        })
        if (readEnvFlag('logLongTasks')) {
          // eslint-disable-next-line no-console
          console.warn(`[perf/longtask] ${entry.duration.toFixed(1)}ms @ ${entry.startTime.toFixed(1)}ms`)
        }
      }
    })
    observer.observe({ entryTypes: ['longtask'] })
  } catch {
    // Browser no soporta longtask: noop
  }
  return () => {
    if (observer) observer.disconnect()
  }
}

/** Muestreo de memoria del renderer (Chrome only, no Electron estable). */
export interface MemorySample {
  usedJsHeapSize: number
  totalJsHeapSize: number
  jsHeapSizeLimit: number
  at: number
}

const memorySamples: MemorySample[] = []
const MEMORY_LIMIT = 720
let memHandle: number | null = null

export function startRendererMemorySampler(intervalMs = 5000): () => void {
  const perf = (
    performance as unknown as {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }
    }
  ).memory
  if (!perf) return () => {}
  if (memHandle !== null) return stopRendererMemorySampler
  memHandle = window.setInterval(() => {
    const p = (
      performance as unknown as {
        memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }
      }
    ).memory
    if (!p) return
    memorySamples.push({
      usedJsHeapSize: p.usedJSHeapSize,
      totalJsHeapSize: p.totalJSHeapSize,
      jsHeapSizeLimit: p.jsHeapSizeLimit,
      at: now()
    })
    if (memorySamples.length > MEMORY_LIMIT) {
      memorySamples.splice(0, memorySamples.length - MEMORY_LIMIT)
    }
  }, intervalMs)
  return stopRendererMemorySampler
}

export function stopRendererMemorySampler(): void {
  if (memHandle !== null) {
    window.clearInterval(memHandle)
    memHandle = null
  }
}

export function getRendererMemorySamples(): ReadonlyArray<MemorySample> {
  return memorySamples.slice()
}
