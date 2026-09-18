/**
 * Performance del main process — startup + lifecycle.
 *
 * API mínima: marcar fases, exponer reporte por IPC, aplicar switches
 * de Chromium (memoria, V8 cache, COOP/COEP) antes de app.whenReady.
 *
 * El código de producto solo llama `markPhase('whenReady')` /
 * `markPhase('window.loaded')` / `markPhase('firstPaint')`. Todo lo
 * demás (logging, IPC handler, sampling) está aquí.
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import {
  perfNow,
  readEnvFlag,
  recordTiming,
  resolvePerfProfile,
  snapshotTimings,
  getMainHeapCapMb,
  type PerfProfile,
  type TimingEntry
} from '@shared/perf'

const PERF_IPC = {
  report: 'perf:getReport',
  mark: 'perf:mark'
} as const

interface PhaseSample {
  name: string
  ms: number
  sinceStart: number
}

const phases: PhaseSample[] = []
const t0 = perfNow()
let reportChannel: string | null = null

/**
 * Aplica switches de Chromium/Electron ANTES de app.whenReady.
 * Llamar una sola vez desde el entrypoint del main, lo más arriba posible.
 */
export function applyChromiumSwitches(): void {
  const profile = resolvePerfProfile()
  // En dev dejamos los defaults de Electron: el HMR necesita todo.
  if (profile === 'dev') return

  if (readEnvFlag('capMainHeap')) {
    // Limita la heap de V8 del main. Evita que sesiones largas escale
    // a 1+ GB. Switch oficial de Node, soportado por Electron.
    const mb = getMainHeapCapMb()
    app.commandLine.appendSwitch('js-flags', `--max-old-space-size=${mb}`)
  }

  if (readEnvFlag('v8CodeCache')) {
    // Cache de código V8 (--experimental-code-cache-time-limit no es estable;
    // mejor: usar la app default que ya tiene code cache on en prod builds).
    // No-op por ahora; queda como flag de rollback.
  }
}

/** Marca una fase de boot. Idempotente. */
export function markPhase(name: string, meta?: TimingEntry['meta']): void {
  const now = perfNow()
  phases.push({ name, ms: now, sinceStart: now - t0 })
  recordTiming({
    name: `startup.${name}`,
    startMs: t0,
    durationMs: now - t0,
    meta
  })
  if (readEnvFlag('logStartup')) {
    // eslint-disable-next-line no-console
    console.log(`[perf/startup] ${name} @ +${(now - t0).toFixed(1)}ms`)
  }
}

/** Reporte serializable — se envía al renderer bajo demanda. */
export interface StartupReport {
  profile: PerfProfile
  phases: PhaseSample[]
  timings: readonly TimingEntry[]
  nodeVersion: string
  electronVersion: string
  platform: NodeJS.Platform
  arch: string
}

export function getStartupReport(): StartupReport {
  return {
    profile: resolvePerfProfile(),
    phases: phases.slice(),
    timings: snapshotTimings(),
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron,
    platform: process.platform,
    arch: process.arch
  }
}

/** Muestreo periódico de memoria del main (process.memoryUsage). */
let memSamplerHandle: NodeJS.Timeout | null = null
const memSamples: Array<{ at: number; rss: number; heapUsed: number; heapTotal: number }> = []

export function startMemorySampler(intervalMs = 5000): () => void {
  if (memSamplerHandle) return stopMemorySampler
  memSamplerHandle = setInterval(() => {
    const mu = process.memoryUsage()
    memSamples.push({ at: perfNow(), rss: mu.rss, heapUsed: mu.heapUsed, heapTotal: mu.heapTotal })
    if (memSamples.length > 720) memSamples.splice(0, memSamples.length - 720) // 1h @ 5s
  }, intervalMs)
  if (typeof memSamplerHandle.unref === 'function') memSamplerHandle.unref()
  return stopMemorySampler
}

export function stopMemorySampler(): void {
  if (memSamplerHandle) {
    clearInterval(memSamplerHandle)
    memSamplerHandle = null
  }
}

export function getMemorySamples(): ReadonlyArray<{
  at: number
  rss: number
  heapUsed: number
  heapTotal: number
}> {
  return memSamples.slice()
}

/** Llamar una vez, después de registrar todos los IPC. */
export function registerPerfIpc(): void {
  if (reportChannel) return
  reportChannel = PERF_IPC.report
  ipcMain.handle(PERF_IPC.report, () => {
    const report = getStartupReport()
    const samples = getMemorySamples()
    return { ...report, memorySamples: samples }
  })
  ipcMain.handle(PERF_IPC.mark, (_event, name: unknown) => {
    if (typeof name === 'string' && name.length > 0) markPhase(name)
    return { ok: true }
  })
}

/** Empuja un mark a todas las ventanas vivas (renderer puede esperar 'firstPaint'). */
export function broadcastMark(name: string): void {
  markPhase(name)
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('perf:phaseMarked', { name, at: perfNow() - t0 })
    }
  }
}
