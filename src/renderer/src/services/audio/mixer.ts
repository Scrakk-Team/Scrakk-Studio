// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Mezclador de sonidos del IDE. Es la capa que habla el runtime de eventos:
 * one-shots (`playSound`), ambientes en loop por etiqueta
 * (`startAmbience`/`stopAmbience`) y ducking para bajar el ambiente cuando
 * otro subsistema necesita el foco auditivo.
 *
 * Todo pasa por la ganancia maestra de `./zzfx`, así que mute y volumen
 * maestro se respetan sin duplicar lógica. En entornos sin Web Audio
 * (tests/headless) todas las funciones son no-op seguras y devuelven `null`.
 */

import {
  ensureAudioContext,
  getAudioContext,
  getMasterGainNode,
  isAudioMuted,
  zzfxG
} from './zzfx'

/**
 * Definición de un sonido. Dos formas, excluyentes:
 *  - `zzfx`: parámetros posicionales del sintetizador ZzFX (8 bits, sin archivos).
 *  - `src`: una URL ya resuelta (`data:` o `https:`). Es el camino para audio
 *    REAL: el runtime del pack resuelve su archivo a un `data:` con el mime y
 *    acá se decodifica. La primera vez es async; para que no llegue tarde, el
 *    runtime llama a `preloadSounds()` al activar el evento.
 */
export interface SoundSpec {
  zzfx?: number[]
  src?: string
  /** Ganancia local de la voz (0..N); default 1. */
  gain?: number
  /** Repetir indefinidamente; default false. */
  loop?: boolean
}

/**
 * Buffers ya decodificados por `src`. Sin esto, un ambiente en loop volvería a
 * descargar el archivo cada vez que se activa un evento.
 */
const bufferCache = new Map<string, AudioBuffer>()

/** Decodifica (y cachea) un `src`. `null` si no hay audio o si falla. */
async function loadBuffer(ctx: AudioContext, src: string): Promise<AudioBuffer | null> {
  const cached = bufferCache.get(src)
  if (cached) return cached
  try {
    const res = await fetch(src)
    if (!res.ok) return null
    const bytes = await res.arrayBuffer()
    const decoded = await ctx.decodeAudioData(bytes)
    bufferCache.set(src, decoded)
    return decoded
  } catch {
    return null
  }
}

/** Precalienta una lista de sonidos (los que tengan `src`). Best-effort. */
export async function preloadSounds(specs: SoundSpec[]): Promise<void> {
  const ctx = ensureAudioContext()
  if (!ctx) return
  const srcs = [...new Set(specs.map((s) => s.src).filter((s): s is string => !!s))]
  await Promise.all(srcs.map((src) => loadBuffer(ctx, src)))
}

/**
 * El buffer de un sonido: el cacheado (si es `src`) o el que genera ZzFX. Para
 * un `src` todavía no decodificado devuelve null y deja la carga en marcha.
 */
function bufferFor(spec: SoundSpec, ctx: AudioContext): AudioBuffer | null {
  if (spec.src) {
    const cached = bufferCache.get(spec.src)
    if (cached) return cached
    void loadBuffer(ctx, spec.src)
    return null
  }
  if (spec.zzfx && spec.zzfx.length > 0) return zzfxG(...spec.zzfx)
  return null
}

/** Opciones de reproducción de un one-shot. */
export interface SoundOptions {
  /** Ramp de entrada en ms (evita clicks). Default: sin fade. */
  fadeInMs?: number
}

/** Opciones de un ambiente. */
export interface AmbienceOptions {
  /** Ramp de entrada/salida en ms. Default: sin fade. */
  fadeMs?: number
}

/** Una voz viva: fuente + su ganancia local + objetivo (para ducking). */
interface Voice {
  source: AudioBufferSourceNode
  gain: GainNode
  target: number
}

/** One-shots en curso (para `stopAll`). */
const oneShots = new Set<Voice>()

/**
 * Ambientes por etiqueta. Un valor `null` significa "etiqueta registrada pero
 * sin AudioContext": sirve para garantizar el contrato de no-apilamiento
 * incluso en tests/headless, donde no hay nodos reales.
 */
const ambiences = new Map<string, Voice | null>()

/** Timer de restauración de un ducking (se reemplaza si hay otro duck). */
let duckTimeout: ReturnType<typeof setTimeout> | null = null

/** Cuánto baja el ambiente durante un ducking (35% del objetivo). */
const DUCK_FACTOR = 0.35

/** Ramp por defecto al restaurar tras un ducking. */
const DUCK_RESTORE_MS = 100

function connectToMaster(ctx: AudioContext, gain: GainNode): void {
  gain.connect(getMasterGainNode() ?? ctx.destination)
}

/**
 * Reproduce un sonido puntual. Devuelve el nodo para poder detenerlo, o `null`
 * si no hay audio o estamos en mute.
 */
export function playSound(spec: SoundSpec, opts: SoundOptions = {}): AudioBufferSourceNode | null {
  if (isAudioMuted()) return null
  const ctx = ensureAudioContext()
  if (!ctx) return null
  const buffer = bufferFor(spec, ctx)
  // Un `src` recién pedido se decodifica async: cuando esté, suena. (El runtime
  // igual lo precalienta al activar, así que esto es la red de seguridad.)
  if (!buffer) {
    if (spec.src) {
      void loadBuffer(ctx, spec.src).then((ready) => {
        if (ready && !isAudioMuted()) startVoice(ctx, ready, spec, opts)
      })
    }
    return null
  }
  return startVoice(ctx, buffer, spec, opts)
}

/** Arranca una voz ya decodificada. Devuelve la fuente o null. */
function startVoice(
  ctx: AudioContext,
  buffer: AudioBuffer,
  spec: SoundSpec,
  opts: SoundOptions = {}
): AudioBufferSourceNode | null {
  try {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = spec.loop ?? false

    const gain = ctx.createGain()
    const target = spec.gain ?? 1
    const fade = opts.fadeInMs ?? 0
    if (fade > 0) {
      const now = ctx.currentTime
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(target, now + fade / 1000)
    } else {
      gain.gain.value = target
    }

    source.connect(gain)
    connectToMaster(ctx, gain)

    const voice: Voice = { source, gain, target }
    source.onended = () => {
      oneShots.delete(voice)
    }

    source.start()
    oneShots.add(voice)
    return source
  } catch {
    return null
  }
}

/**
 * Arranca un ambiente en loop asociado a una etiqueta. Llamadas repetidas con
 * la misma etiqueta se ignoran (no se apilan). No hace nada si no hay audio,
 * pero igual registra la etiqueta para que esa garantía sea observable.
 */
export function startAmbience(
  label: string,
  spec: SoundSpec,
  opts: AmbienceOptions = {}
): void {
  if (ambiences.has(label)) return

  const ctx = ensureAudioContext()
  if (!ctx || isAudioMuted()) {
    ambiences.set(label, null)
    return
  }

  const buffer = bufferFor(spec, ctx)
  // Un `src` sin decodificar todavía: se deja la etiqueta registrada (así no se
  // apila) y, cuando el buffer esté, arranca si nadie la pisó.
  if (!buffer) {
    ambiences.set(label, null)
    if (spec.src) {
      void loadBuffer(ctx, spec.src).then((ready) => {
        if (!ready || isAudioMuted()) return
        // Sigue PENDIENTE (null) ⇒ nadie la paró ni la arrancó mientras cargaba.
        if (ambiences.get(label) !== null) return
        ambiences.delete(label)
        startAmbience(label, spec, opts)
      })
    }
    return
  }

  try {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true

    const gain = ctx.createGain()
    const target = spec.gain ?? 0.5
    const fade = opts.fadeMs ?? 0
    if (fade > 0) {
      const now = ctx.currentTime
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(target, now + fade / 1000)
    } else {
      gain.gain.value = target
    }

    source.connect(gain)
    connectToMaster(ctx, gain)
    source.start()
    ambiences.set(label, { source, gain, target })
  } catch {
    ambiences.set(label, null)
  }
}

/** Ramp de salida y `stop()` de una voz, sin lanzar si algo falla. */
function fadeOutAndStop(voice: Voice, fadeMs: number): void {
  const ctx = getAudioContext()
  if (!ctx || fadeMs <= 0) {
    try {
      voice.source.stop()
    } catch {
      // Ya estaba detenida.
    }
    return
  }
  try {
    const now = ctx.currentTime
    const sec = fadeMs / 1000
    voice.gain.gain.cancelScheduledValues(now)
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now)
    voice.gain.gain.linearRampToValueAtTime(0, now + sec)
    voice.source.stop(now + sec + 0.02)
  } catch {
    try {
      voice.source.stop()
    } catch {
      // no-op
    }
  }
}

/**
 * Detiene un ambiente (o todos si no se pasa etiqueta), con fade opcional.
 * Siempre deja la etiqueta libre para poder reiniciarla.
 */
export function stopAmbience(label?: string, fadeMs = 0): void {
  if (label === undefined) {
    for (const key of [...ambiences.keys()]) stopAmbience(key, fadeMs)
    return
  }
  const voice = ambiences.get(label)
  ambiences.delete(label)
  if (voice) fadeOutAndStop(voice, fadeMs)
}

/** Detiene todos los ambientes y one-shots. */
export function stopAll(fadeMs = 0): void {
  stopAmbience(undefined, fadeMs)
  for (const voice of [...oneShots]) fadeOutAndStop(voice, fadeMs)
  oneShots.clear()
}

/**
 * Baja el volumen del ambiente durante `ms` para dejar lugar a otro sonido
 * (p. ej. una notificación). Es intencionalmente simple: aplica un factor fijo
 * al gain de cada ambiente y programa la restauración al terminar la ventana.
 * No hace nada sin audio.
 */
export function duckFor(ms: number): void {
  const ctx = getAudioContext()
  if (!ctx || !(ms > 0)) return

  for (const voice of ambiences.values()) {
    if (!voice) continue
    try {
      const now = ctx.currentTime
      voice.gain.gain.cancelScheduledValues(now)
      voice.gain.gain.setValueAtTime(voice.target * DUCK_FACTOR, now)
    } catch {
      // no-op
    }
  }

  if (duckTimeout) clearTimeout(duckTimeout)
  duckTimeout = setTimeout(() => {
    duckTimeout = null
    const current = getAudioContext()
    if (!current) return
    for (const voice of ambiences.values()) {
      if (!voice) continue
      try {
        const now = current.currentTime
        voice.gain.gain.cancelScheduledValues(now)
        voice.gain.gain.linearRampToValueAtTime(voice.target, now + DUCK_RESTORE_MS / 1000)
      } catch {
        // no-op
      }
    }
  }, ms)
}

/** Solo tests: corta todo y limpia registros/estado. */
export function resetMixerForTests(): void {
  for (const voice of oneShots) {
    try {
      voice.source.stop()
    } catch {
      // no-op
    }
  }
  for (const voice of ambiences.values()) {
    if (!voice) continue
    try {
      voice.source.stop()
    } catch {
      // no-op
    }
  }
  oneShots.clear()
  ambiences.clear()
  if (duckTimeout) {
    clearTimeout(duckTimeout)
    duckTimeout = null
  }
}

/** Solo tests: cantidad de ambientes registrados (con o sin nodo real). */
export function getAmbienceCountForTests(): number {
  return ambiences.size
}

/** Solo tests: cantidad de one-shots en curso. */
export function getActiveSoundCountForTests(): number {
  return oneShots.size
}
