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
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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
 * true si hay una GPU Intel de generación 7 o anterior (Sandy/Ivy Bridge) en
 * Linux. Se lee de `/sys` (barato y síncrono, antes de `ready`): vendor Intel
 * (0x8086) y device id < 0x0300 (Gen7 cae en 0x01xx).
 *
 * En esa generación:
 *  - VA-API intenta el driver **iHD** (Gen9+), que falla; le corresponde
 *    **i965**. La app lo fija por su cuenta (el usuario no toca nada).
 *  - **Vulkan no existe**: se evita para que el proceso de GPU no falle
 *    (parpadeo). WebGL sigue por OpenGL (Mesa).
 */
function isLegacyIntelGpu(): boolean {
  if (process.platform !== 'linux') return false
  try {
    const entries = readdirSync('/sys/class/drm')
    for (const entry of entries) {
      if (!/^card\d+$/.test(entry)) continue
      const deviceDir = join('/sys/class/drm', entry, 'device')
      const vendor = readFileSync(join(deviceDir, 'vendor'), 'utf8').trim()
      if (vendor !== '0x8086') continue
      const id = parseInt(readFileSync(join(deviceDir, 'device'), 'utf8').trim(), 16)
      if (Number.isFinite(id) && id < 0x0300) return true
    }
  } catch {
    // Sin /sys legible: no asumir nada (se usa el camino normal).
  }
  return false
}

/**
 * KDE + Wayland. KWin tiene bugs de composición (buffer ring / explicit sync)
 * que congelan y parpadean el contenido de CUALQUIER app Chromium/Electron
 * (KDE #506731 → #521687, y #510747; Firefox no). Correr por XWayland evita
 * ese camino: es el workaround que usan otras apps Electron.
 */
function isKdeWayland(): boolean {
  if (process.platform !== 'linux') return false
  if (process.env.XDG_SESSION_TYPE !== 'wayland') return false
  return /kde/i.test(process.env.XDG_CURRENT_DESKTOP ?? '')
}

/**
 * Aplica switches de Chromium/Electron ANTES de app.whenReady.
 * Llamar una sola vez desde el entrypoint del main, lo más arriba posible.
 */
export function applyChromiumSwitches(): void {
  const disableFeatures: string[] = []

  // GPU vieja de Intel (Linux): la app se adapta SOLA, sin que el usuario
  // instale nada. Solo aplica a ese hardware; en GPUs modernas no toca nada
  // (no se pierde rendimiento).
  if (process.platform === 'linux' && isLegacyIntelGpu()) {
    // Driver VA-API correcto para Gen7 (respeta lo que ya haya en el entorno).
    if (!process.env.LIBVA_DRIVER_NAME) process.env.LIBVA_DRIVER_NAME = 'i965'
    // Vulkan no aplica en Gen7: se evita el camino roto (WebGL por OpenGL).
    disableFeatures.push('Vulkan', 'VulkanFromANGLE', 'DefaultANGLEVulkan')
  }

  // KDE + Wayland: bug de KWin (buffer ring / explicit sync) que congela y
  // parpadea el contenido de CUALQUIER app Chromium/Electron (KDE #506731 →
  // #521687, #510747; Firefox no). Correr por XWayland evita ese camino.
  // Se respeta `ELECTRON_OZONE_PLATFORM_HINT` y se puede desactivar con
  // `SCRAKK_PERF_KDE_X11=0`.
  if (
    isKdeWayland() &&
    !process.env.ELECTRON_OZONE_PLATFORM_HINT &&
    process.env.SCRAKK_PERF_KDE_X11 !== '0'
  ) {
    app.commandLine.appendSwitch('ozone-platform', 'x11')
  }

  // Escape manual (soporte/otros equipos): forzar OpenGL y evitar VA-API.
  if (process.env.SCRAKK_PERF_FORCE_GL === '1') {
    disableFeatures.push(
      'Vulkan',
      'VulkanFromANGLE',
      'DefaultANGLEVulkan',
      'VaapiVideoDecoder',
      'VaapiVideoEncoder'
    )
  }

  if (disableFeatures.length > 0) {
    app.commandLine.appendSwitch('disable-features', [...new Set(disableFeatures)].join(','))
  }

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
