// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

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
 * Sesión Wayland (cualquier compositor, no solo KDE). Desde Electron 38 el
 * default de `--ozone-platform` es `auto`, así que en una sesión Wayland la
 * app arranca como cliente Wayland nativo. Se usa para elegir un perfil GPU
 * que no dependa del camino Vulkan de Ozone/Wayland (frágil en Mesa/NVIDIA),
 * sin forzar XWayland ni asumir un escritorio concreto.
 */
function isWaylandSession(): boolean {
  if (process.platform !== 'linux') return false
  if (process.env.XDG_SESSION_TYPE === 'wayland') return true
  return Boolean(process.env.WAYLAND_DISPLAY)
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

  // Wayland nativo (default desde Electron 38). NO se fuerza XWayland: el
  // problema real de las ventanas negras/vacías es el camino Vulkan de
  // Ozone/Wayland, y se ataca abajo en el perfil GPU sin depender del flag
  // `--ozone-platform=x11` ni de un escritorio concreto.
  const wayland = isWaylandSession()

  // GPU en Linux: hay drivers (por ejemplo AMD con RADV) y sandboxes de
  // usuario restringidos que hacen crashear el proceso de GPU (SIGSEGV:
  // "GPU process exited unexpectedly", "Failed to send GpuControl.
  // CreateCommandBuffer") y la ventana queda en blanco. Por defecto se
  // desactiva el sandbox de la GPU y se permite **SwiftShader** como respaldo
  // de WebGL (el motor Innerta dibuja el editor en un canvas: sin esto, si la
  // GPU falla, el canvas queda vacío).
  //
  // Escape manual para soporte: SCRAKK_GPU=auto|gl|swiftshader|vulkan.
  if (process.platform === 'linux') {
    const gpuMode = (process.env.SCRAKK_GPU ?? 'auto').toLowerCase()
    if (gpuMode === 'swiftshader') {
      app.commandLine.appendSwitch('disable-gpu')
      app.commandLine.appendSwitch('enable-unsafe-swiftshader')
    } else if (gpuMode === 'gl') {
      app.commandLine.appendSwitch('use-gl', 'angle')
      app.commandLine.appendSwitch('use-angle', 'gl')
      app.commandLine.appendSwitch('disable-gpu-sandbox')
      app.commandLine.appendSwitch('enable-unsafe-swiftshader')
    } else if (gpuMode !== 'vulkan') {
      // Perfil `auto`. En sesión Wayland se evita Vulkan: Chromium entra en su
      // ruta de init aunque no se pida y la surface factory de Ozone/Wayland
      // puede abortar → ventana negra/vacía (Electron #51941, orca #718,
      // brave #55805). ANGLE por OpenGL es el camino estable en Mesa/NVIDIA.
      if (wayland) {
        disableFeatures.push('Vulkan', 'VulkanFromANGLE', 'DefaultANGLEVulkan')
        app.commandLine.appendSwitch('use-gl', 'angle')
        app.commandLine.appendSwitch('use-angle', 'gl')
      }
      app.commandLine.appendSwitch('disable-gpu-sandbox')
      app.commandLine.appendSwitch('enable-unsafe-swiftshader')
    }
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

  // Diagnóstico (SCRAKK_PERF_LOG_STARTUP=1): primera cosa a mirar ante un
  // reporte de "ventana negra" o "no abre". Deja constancia del entorno
  // gráfico elegido sin tener que reproducir el bug.
  if (process.platform === 'linux' && readEnvFlag('logStartup')) {
    const gpuMode = (process.env.SCRAKK_GPU ?? 'auto').toLowerCase()
    // eslint-disable-next-line no-console
    console.log(
      `[perf/startup] linux session=${wayland ? 'wayland' : 'x11'} gpu=${gpuMode}` +
        ` ozone=${app.commandLine.getSwitchValue('ozone-platform') || 'auto'}` +
        ` disabled=${[...new Set(disableFeatures)].join('|') || 'none'}`
    )
  }

  const profile = resolvePerfProfile()
  // En dev dejamos los defaults de Electron: el HMR necesita todo.
  if (profile === 'dev') return

  if (readEnvFlag('capMainHeap')) {
    // Opt-in (default OFF). `--js-flags` se propaga a TODOS los procesos,
    // incluido el renderer: con un tope bajo (256 MB) el renderer moría con
    // V8 OOM al abrir varios archivos. Si se activa, elegir un tope holgado.
    const mb = getMainHeapCapMb()
    app.commandLine.appendSwitch('js-flags', `--max-old-space-size=${mb}`)
  }

  if (readEnvFlag('v8CodeCache')) {
    // Cache de código V8 (--experimental-code-cache-time-limit no es estable;
    // mejor: usar la app default que ya tiene code cache on en prod builds).
    // No-op por ahora; queda como flag de rollback.
  }
}

/**
 * Degradación automática de GPU (Linux). Si el proceso de GPU muere (driver o
 * compositor incompatible), se relanza la app UNA vez con software rendering.
 * Así la app se recupera sola en cualquier distro/driver, sin hardcodear GPUs
 * ni escritorios y sin forzar XWayland.
 *
 * Se omite con override explícito del usuario (`SCRAKK_GPU`) y no se repite si
 * ya venimos de un relanzamiento (`SCRAKK_GPU_FALLBACK=1`).
 */
export function registerGpuFallback(): void {
  if (process.platform !== 'linux') return
  if (process.env.SCRAKK_GPU) return
  if (process.env.SCRAKK_GPU_FALLBACK === '1') return

  app.on('child-process-gone', (_event, details) => {
    if (details.type !== 'GPU') return
    process.env.SCRAKK_GPU_FALLBACK = '1'
    // eslint-disable-next-line no-console
    console.error(
      `[perf/startup] GPU process gone (reason=${details.reason}). ` +
        'Relanzando con software rendering (--disable-gpu).'
    )
    app.relaunch({
      args: [...process.argv.slice(1), '--disable-gpu', '--enable-unsafe-swiftshader']
    })
    app.exit(0)
  })
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
