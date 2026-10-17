// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Runtime de eventos — activar, ejecutar la coreografía y APAGAR SOLO.
 *
 * Reglas que este archivo garantiza:
 *
 *  1. **Un evento a la vez.** Activar otro desactiva el anterior (y restaura).
 *  2. **Los overrides son en memoria.** Nunca se persisten: si la app se cierra
 *     a mitad de evento, el próximo arranque está limpio (nada de "tema pegado").
 *  3. **Se apaga en el borde de la ventana.** Al llegar a `until` (o a
 *     `durationMs`, lo que pase primero) se desactiva solo, aunque la app siga
 *     abierta.
 *  4. **El comando manda.** Activar a mano ignora la ventana (es la forma de
 *     probar un evento en julio); el activado AUTOMÁTICO sí la respeta.
 *
 * El estado "estoy activo" se avisa por `subscribeToActiveEvent`, y además se
 * publica un chip en la status bar mientras dura.
 */

import type { EventOp, EventScene } from '@shared/events'
import { evaluateWindow, type WindowEvaluation } from '@shared/events'
import {
  activateTheme,
  deactivateTheme,
  getActiveThemeId,
  getTheme
} from '@services/extensions/types/themes/logic'
import { getEvent, listEvents, registerEvent, subscribeToEvents } from '@services/extensions/types/events/logic'
import { normalizeEventScene } from '@services/extensions/types/events/schema'
// El motor se importa por MÓDULO (no por el barrel): el runtime no necesita el
// componente React de la capa, sólo el engine — y así no arrastra React/CSS.
import { engine } from '@services/effects/engine'
import { playSound, preloadSounds, startAmbience, stopAmbience, stopAll, type SoundSpec } from '@services/audio'
import { resolvePackagePath } from '@services/extensions/extensionDirs'
import { notify } from '@services/notifications'
import { extensionStatusBar } from '@services/extensions/statusBar'
import { t } from '@core/i18n'
import { isEventDone, markEventActivated, markEventCompleted } from './state'
import {
  getEventNow,
  getFakeNow,
  isTestingEvents,
  subscribeEventClock,
  subscribeTestingEvents
} from './testing'

/** Cada cuánto se revisa si hay que activar o apagar algo. */
const CHECK_INTERVAL_MS = 60_000

/** Dueño del chip de la status bar (el runtime, no el pack). */
const STATUS_OWNER = 'scrakk.events'
const STATUS_ID = 'scrakk.events.active'

/** Versión del IDE, para `minEngine`. Sin dato → null (no bloquea). */
export function appVersion(): string | null {
  try {
    return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : null
  } catch {
    return null
  }
}

interface ActiveEvent {
  id: string
  name: string
  /** Extensión dueña: su raíz es la que puede leer audio del pack. */
  extensionId: string
  scene: EventScene
  intensity: number
  startedAt: number
  /** Cuándo se apaga solo (null = hasta que lo detengan). */
  endsAt: number | null
  timers: ReturnType<typeof setTimeout>[]
  /** Tema que había ANTES, para restaurarlo. */
  prevTheme: string | null
  statusId: string | null
  /** Sonidos con `file` ya resueltos a su `data:` (por clave del pack). */
  srcByKey: Map<string, string>
}

let active: ActiveEvent | null = null
let checkTimer: ReturnType<typeof setInterval> | null = null
/** Ya ofrecidos en esta sesión: no spamear el aviso de "evento disponible". */
const offered = new Set<string>()
const listeners = new Set<() => void>()

function emitActive(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // Un suscriptor roto no debe tumbar a los demás.
    }
  }
}

export function subscribeToActiveEvent(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getActiveEventId(): string | null {
  return active?.id ?? null
}

export interface ActiveEventSnapshot {
  id: string
  name: string
  startedAt: number
  endsAt: number | null
}

export function getActiveEvent(): ActiveEventSnapshot | null {
  if (!active) return null
  return {
    id: active.id,
    name: active.name,
    startedAt: active.startedAt,
    endsAt: active.endsAt
  }
}

/** Estado de la ventana de un evento AHORA (para la UI y el comando de lista). */
export function getEventWindow(id: string): WindowEvaluation | null {
  const entry = getEvent(id)
  if (!entry) return null
  return evaluateWindow(entry.scene.schedule, getEventNow(), appVersion())
}

/** `@clave` → string del pack. Sin `@`, se devuelve tal cual. */
function resolveText(scene: EventScene, value: string | undefined): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  if (!value.startsWith('@')) return value
  const key = value.slice(1)
  return scene.strings?.[key] ?? key
}

/**
 * Un sonido del pack es un ARCHIVO en disco: se lee con el `readBinary` de la
 * app (que devuelve base64 + mime) y se arma un `data:`.
 *
 * El path queda CLAVADO a la raíz del paquete (`resolvePackagePath` rechaza
 * `..`), así que un pack no puede leer audio de afuera de su propia carpeta.
 */
async function resolveSoundSrc(extensionId: string, file: string): Promise<string | null> {
  const abs = resolvePackagePath(extensionId, file)
  const bridge = appFsBridge()
  if (!abs || !bridge?.readBinary) return null
  try {
    const res = await bridge.readBinary(abs)
    if (!res?.success || !res.base64) return null
    return `data:${res.mime ?? 'audio/ogg'};base64,${res.base64}`
  } catch {
    return null
  }
}

/**
 * El puente `fs` de la APP (el que usan los visores para leer binarios). No es
 * la API que se le presta a las extensiones: por eso se accede con la forma
 * mínima que hace falta.
 */
interface AppFsBridge {
  readFile?: (path: string) => Promise<{ success?: boolean; content?: string }>
  readBinary?: (path: string) => Promise<{ success?: boolean; base64?: string; mime?: string }>
}

function appFsBridge(): AppFsBridge | undefined {
  return (window as unknown as { api?: { fs?: AppFsBridge } }).api?.fs
}

/**
 * Re-lee las escenas con `path` desde el paquete, SIN reiniciar la app.
 *
 * El registro guarda la escena ya normalizada en el boot, así que editar el JSON
 * de un pack no se veía hasta reiniciar — y eso se siente como "el cambio no se
 * aplicó" (pasó con los sonidos). Devuelve cuántas releyó.
 */
export async function reloadEvents(): Promise<number> {
  const bridge = appFsBridge()
  let reloaded = 0
  for (const entry of listEvents()) {
    if (!entry.scenePath || !bridge?.readFile) continue
    const abs = resolvePackagePath(entry.extensionId, entry.scenePath)
    if (!abs) continue
    try {
      const res = await bridge.readFile(abs)
      if (!res?.success || typeof res.content !== 'string') continue
      const scene = normalizeEventScene(JSON.parse(res.content))
      // JSON roto: se deja la escena anterior (mejor que quedarse sin evento).
      if (!scene) continue
      registerEvent({ ...entry, scene })
      reloaded += 1
    } catch {
      // Ídem: no se pisa una escena válida con una rota.
    }
  }
  return reloaded
}

/**
 * Resuelve los sonidos con `file` del evento y los precalienta.
 *
 * No se espera desde `activateEvent` (que es sync): el timeline arranca igual y
 * los sonidos reales entran en cuanto están decodificados. El trueno, que va a
 * los ~2,6 s, llega con margen de sobra.
 */
async function resolveSceneSounds(active: ActiveEvent): Promise<void> {
  const sounds = active.scene.sounds
  if (!sounds) return
  const specs: SoundSpec[] = []
  for (const [key, sound] of Object.entries(sounds)) {
    if (!sound.file) {
      if (sound.zzfx) specs.push({ zzfx: sound.zzfx, gain: sound.gain })
      continue
    }
    const src = await resolveSoundSrc(active.extensionId, sound.file)
    if (src) {
      active.srcByKey.set(key, src)
      specs.push({ src, gain: sound.gain })
    }
  }
  await preloadSounds(specs)
}

/** La spec de un sonido del pack, ya con su `src` resuelto si es un archivo. */
function soundSpec(key: string, gainScale: number): SoundSpec | null {
  const sound = active?.scene.sounds?.[key]
  if (!sound) return null
  const gain = (sound.gain ?? 1) * gainScale
  const src = active?.srcByKey.get(key)
  if (src) return { src, gain }
  if (sound.zzfx) return { zzfx: sound.zzfx, gain }
  return null
}

/** ms máximo de un `setTimeout` (32 bits con signo, ~24.8 días). */
const MAX_TIMEOUT = 2_147_483_647

/** Programa una op del timeline. Si el evento cambió, la op ya no corre. */
function scheduleAt(delay: number, fn: () => void): void {
  if (delay <= 0) {
    fn()
    return
  }
  // Un delay más grande que el límite de `setTimeout` queda clampeado a 1ms:
  // eso apagaría AL INSTANTE un evento cuya ventana cierra lejos. Se agenda por
  // tramos; el chequeo periódico sigue siendo el que manda de verdad.
  if (delay > MAX_TIMEOUT) {
    scheduleAt(MAX_TIMEOUT, () => scheduleAt(delay - MAX_TIMEOUT, fn))
    return
  }
  const timer = setTimeout(fn, delay)
  active?.timers.push(timer)
}

/** Corre UNA op contra el motor de efectos / audio / UI. */
function applyOp(op: EventOp, scene: EventScene, intensity: number): void {
  switch (op.op) {
    case 'stage.fog':
      engine.setFog((op.amount ?? 0.4) * intensity, op.tint ?? null, op.fade ?? 1200)
      break
    case 'stage.tint':
      engine.setTint(op.tint ?? 'accent', (op.amount ?? 0.25) * intensity, op.fade ?? 1200)
      break
    case 'stage.vignette':
      engine.setVignette((op.amount ?? 0.5) * intensity, op.fade ?? 1200)
      break
    case 'stage.shake':
      engine.shake((op.intensity ?? 3) * intensity, op.duration ?? 400)
      break
    case 'emit': {
      if (!op.draw) break
      const spec = {
        shape: op.draw,
        count: op.count ?? 1,
        motion: op.motion,
        jitter: op.jitter,
        spread: op.spread,
        bank: op.bank,
        alpha: op.alpha,
        size: op.size,
        rotate: op.rotate,
        flapHz: op.flapHz,
        life: op.life
      }
      const every = op.every ?? 0
      // "Río": una instancia cada `every` ms en vez de todas de golpe.
      if (every > 0 && spec.count > 1) {
        for (let i = 0; i < spec.count; i++) {
          scheduleAt(every * i, () => engine.emit({ ...spec, count: 1 }, intensity))
        }
        break
      }
      engine.emit(spec, intensity)
      break
    }
    case 'audio.play': {
      const spec = soundSpec(op.sound ?? '', op.amount ?? 1)
      if (spec) playSound(spec)
      break
    }
    case 'audio.ambience': {
      if (!op.sound) break
      const spec = soundSpec(op.sound, op.amount ?? 1)
      if (spec) startAmbience(op.sound, spec, { fadeMs: op.fade ?? 800 })
      break
    }
    case 'audio.stop':
      stopAmbience(undefined, op.fade ?? 800)
      break
    case 'notify':
      notify({
        title: resolveText(scene, op.title) ?? t('services.event.aviso'),
        message: resolveText(scene, op.message),
        severity: op.severity ?? 'info'
      })
      break
    case 'status.add': {
      const text = resolveText(scene, op.text)
      if (!text) break
      const id = active?.statusId ?? STATUS_ID
      extensionStatusBar.apply({
        id,
        extensionId: STATUS_OWNER,
        alignment: 'right',
        priority: 5,
        text,
        tooltip: t('services.event.activo'),
        icon: op.icon,
        visible: true
      })
      if (active) active.statusId = id
      break
    }
    case 'theme.set':
      if (op.theme && getTheme(op.theme)) activateTheme(op.theme)
      break
  }
}

/** Corre el timeline (o las ops de `onStop`) ya ordenadas por `at`. */
function runOps(ops: EventOp[], scene: EventScene, intensity: number): void {
  for (const op of ops) scheduleAt(op.at ?? 0, () => applyOp(op, scene, intensity))
}

/**
 * Activa un evento.
 *
 * `force` = lo pidió el usuario (comando): se ignora la ventana. El camino
 * automático NO usa `force` y por eso respeta la ventana y el `once`.
 */
export function activateEvent(id: string, options: { force?: boolean } = {}): boolean {
  const entry = getEvent(id)
  if (!entry) {
    console.warn(`[events] no existe el evento "${id}"`)
    return false
  }
  if (active?.id === id) return true
  if (active) deactivateEvent('replace')

  const now = getEventNow()
  const win = evaluateWindow(entry.scene.schedule, now, appVersion())

  if (!options.force) {
    if (!win.active) return false
    if (entry.scene.activation?.once !== false && isEventDone(id, isTestingEvents())) return false
  } else if (win.status === 'unsupported-engine') {
    console.warn(`[events] "${id}" pide una versión del IDE más nueva (minEngine)`)
    return false
  }

  const intensity = entry.scene.intensity ?? 1
  const durationMs = entry.scene.durationMs ?? null
  // Se apaga con lo que pase primero: la duración del evento o el cierre de la
  // ventana. Sólo cuenta un cierre FUTURO (activado a mano fuera de ventana no
  // debe morir al instante).
  const candidates: number[] = []
  if (durationMs !== null) candidates.push(now + durationMs)
  if (win.closesAt !== null && win.closesAt > now) candidates.push(win.closesAt)
  const endsAt = candidates.length > 0 ? Math.min(...candidates) : null

  active = {
    id: entry.id,
    name: entry.name,
    extensionId: entry.extensionId,
    scene: entry.scene,
    intensity,
    startedAt: now,
    endsAt,
    timers: [],
    prevTheme: getActiveThemeId(),
    statusId: null,
    srcByKey: new Map()
  }
  engine.setIntensity(intensity)

  // Audio real del pack: resolver `file` → `data:` y decodificar, en paralelo
  // (no bloquea la activación). Sin esto el primer sonido llegaría antes que el
  // archivo.
  void resolveSceneSounds(active)

  // Override de tema ANTES de la coreografía: si la escena además hace
  // `theme.set`, ese gana (corre después).
  const forced = entry.scene.override?.theme
  if (forced && getTheme(forced)) activateTheme(forced)

  runOps(entry.scene.timeline, entry.scene, intensity)
  markEventActivated(entry.id, isTestingEvents())
  emitActive()

  if (endsAt !== null) {
    // `endsAt` es absoluto: el delay se recalcula por si la op tarda.
    const delay = Math.max(0, endsAt - getEventNow())
    scheduleAt(delay, () => {
      if (active?.id === entry.id) deactivateEvent('window')
    })
  }
  return true
}

/** Desactiva el evento activo y RESTAURA todo. Sin activo: no-op. */
export function deactivateEvent(reason: 'manual' | 'window' | 'replace' = 'manual'): void {
  const current = active
  if (!current) return

  // 1) `onStop` con el contexto todavía vivo. Son fades de salida: se aplican
  //    YA (no tiene sentido programarlas y cancelarlas en el paso siguiente).
  for (const op of current.scene.onStop ?? []) applyOp(op, current.scene, current.intensity)

  // 2) Cancelar lo programado y bajar el audio.
  active = null
  for (const timer of current.timers) clearTimeout(timer)
  current.timers = []
  stopAll(600)

  // 3) Escenario y chip.
  engine.clear(600)
  if (current.statusId) extensionStatusBar.apply({ id: current.statusId, removed: true })

  // 4) Tema: sólo si el evento lo había forzado Y sigue siendo el activo (si el
  //    usuario lo cambió a mano en el medio, su elección manda).
  const forced = current.scene.override?.theme
  if (forced && getActiveThemeId() === forced) {
    if (current.prevTheme) activateTheme(current.prevTheme)
    else deactivateTheme()
  }

  markEventCompleted(current.id, isTestingEvents())
  emitActive()
  void reason
}

export function stopActiveEvent(): void {
  deactivateEvent('manual')
}

/**
 * Revisa: (a) si el activo ya venció, y (b) si hay alguno que corresponda
 * activar. Se llama al boot, cada minuto, cuando cambia el reloj/flag y cuando
 * se registra/desregistra un evento.
 */
export function evaluateEvents(): void {
  const testing = isTestingEvents()
  // En testing SIN reloj falso no hay automáticos: no querés que se te dispare
  // algo sólo porque HOY, de casualidad, hay un evento en ventana. Con el reloj
  // falso puesto, el camino automático se comporta igual que en producción.
  if (testing && getFakeNow() === null) return

  const now = getEventNow()
  if (active && active.endsAt !== null && now >= active.endsAt) {
    deactivateEvent('window')
  }
  if (active) return

  const version = appVersion()
  const candidates = listEvents()
    .map((entry) => ({ entry, win: evaluateWindow(entry.scene.schedule, now, version) }))
    .filter(({ entry, win }) => {
      if (!win.active) return false
      const once = entry.scene.activation?.once !== false
      return !once || !isEventDone(entry.id, testing)
    })
    .sort(
      (a, b) =>
        (b.entry.scene.activation?.priority ?? 0) - (a.entry.scene.activation?.priority ?? 0)
    )

  for (const { entry } of candidates) {
    const mode = entry.scene.activation?.mode ?? 'notify'
    if (mode === 'manual') continue
    if (mode === 'auto') {
      activateEvent(entry.id)
      return
    }
    if (offered.has(entry.id)) continue
    offered.add(entry.id)
    notify({
      title: entry.name,
      message: t('services.event.aviso.mensaje'),
      severity: 'info',
      timeoutMs: 0,
      actions: [
        {
          label: t('services.event.activar'),
          run: () => {
            activateEvent(entry.id, { force: true })
          }
        }
      ]
    })
    return
  }
}

/** Arranca el runtime: revisión periódica + reacción a cambios. */
export function bootEvents(): void {
  subscribeToEvents(() => evaluateEvents())
  subscribeEventClock(() => evaluateEvents())
  subscribeTestingEvents(() => evaluateEvents())
  if (checkTimer === null) {
    checkTimer = setInterval(() => evaluateEvents(), CHECK_INTERVAL_MS)
  }
  evaluateEvents()
}

/** Sólo para tests: apaga el loop y olvida el estado en memoria. */
export function resetEventsRuntimeForTests(): void {
  if (checkTimer !== null) {
    clearInterval(checkTimer)
    checkTimer = null
  }
  const current = active
  active = null
  if (current) {
    for (const timer of current.timers) clearTimeout(timer)
    if (current.statusId) extensionStatusBar.apply({ id: current.statusId, removed: true })
  }
  offered.clear()
  engine.clear(0)
  listeners.clear()
}
