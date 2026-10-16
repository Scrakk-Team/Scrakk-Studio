// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Port a TypeScript de **ZzFX Micro** (Zuper Zmall Zound Zynth).
 *
 * ZzFX es un sintetizador minúsculo donde un sonido es, literalmente, un array
 * de números. Su autor es Frank Force (KilledByAPixel) y su licencia es **MIT**;
 * por eso este port conserva la atribución de origen aunque aquí se reescriba
 * con nombres legibles. Obra original: https://github.com/KilledByAPixel/ZzFX
 * — "ZzFX Micro v1.3.2" (MIT License, Copyright 2019 Frank Force).
 *
 * La matemática de síntesis (frecuencias, curva de onda, ruido, trémolo,
 * envolvente de ataque/decaimiento/sostenido/relajación, pitch-jump y repeat)
 * es la del ZzFX original. Lo único que se omite es el filtro biquad opcional
 * (parámetro `N`), que no forma parte de la firma que consume el IDE.
 */

/** Constante de volumen propia de ZzFX (así suena el algoritmo original). */
const ZzFX_VOLUME = 0.3

/** ZzFX genera siempre a 44.1 kHz; el navegador lo remuestrea al reproducir. */
const ZzFX_SAMPLE_RATE = 44100

/** 2π. */
const TAU = Math.PI * 2

/** Clave de localStorage del volumen maestro (cruda, sin prefijo de módulo). */
export const MASTER_VOLUME_KEY = 'scrakk:master-volume'

/** Clave de localStorage del mute global (cruda, sin prefijo de módulo). */
export const AUDIO_MUTED_KEY = 'scrakk:audio-muted'

// ── Estado del motor ────────────────────────────────────────────────────

/** AudioContext compartido, creado de forma perezosa. */
let zzfxX: AudioContext | null = null

/** Ganancia maestra por la que pasan TODAS las voces (volumen + mute). */
let masterGain: GainNode | null = null

/** Volumen maestro 0..1, persistido. */
let masterVolume = loadMasterVolume()

/** Mute global, persistido. */
let muted = loadAudioMuted()

/** Evita instalar dos veces el desbloqueo por gesto. */
let unlockInstalled = false

// ── Acceso a localStorage (a prueba de entornos sin storage) ────────────

/**
 * Devuelve el storage disponible o `null`. Se prioriza `window.localStorage`
 * (el camino real en Electron/renderer y el que stubean los tests) y se cae a
 * `globalThis.localStorage` si existiera.
 */
function getStorage(): Storage | null {
  try {
    const win = (globalThis as { window?: { localStorage?: Storage } }).window
    if (win?.localStorage) return win.localStorage
    const g = globalThis as { localStorage?: Storage }
    return g.localStorage ?? null
  } catch {
    return null
  }
}

/** Normaliza un número a 0..1 (NaN/infinito → 1, el default). */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(1, Math.max(0, value))
}

function loadMasterVolume(): number {
  const storage = getStorage()
  if (!storage) return 1
  try {
    const raw = storage.getItem(MASTER_VOLUME_KEY)
    if (raw === null) return 1
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? clamp01(parsed) : 1
  } catch {
    return 1
  }
}

function loadAudioMuted(): boolean {
  const storage = getStorage()
  if (!storage) return false
  try {
    return storage.getItem(AUDIO_MUTED_KEY) === '1'
  } catch {
    return false
  }
}

function persist(key: string, value: string): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(key, value)
  } catch {
    // Sin almacenamiento: el valor queda solo en memoria esta sesión.
  }
}

// ── AudioContext perezoso + desbloqueo por gesto ────────────────────────

/**
 * Crea (una sola vez) el AudioContext y su ganancia maestra, y trata de
 * resumirlo si el navegador lo dejó suspendido. Devuelve `null` —sin lanzar—
 * cuando no hay Web Audio (Node/tests/SSR), que es justo lo que queremos.
 */
export function ensureAudioContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  try {
    if (!zzfxX) {
      zzfxX = new AudioContext()
      masterGain = zzfxX.createGain()
      masterGain.gain.value = muted ? 0 : masterVolume
      masterGain.connect(zzfxX.destination)
    }
    if (zzfxX.state === 'suspended') {
      void zzfxX.resume().catch(() => {
        // El gesto todavía no llegó: se reintentará en el próximo play/unlock.
      })
    }
    return zzfxX
  } catch {
    return null
  }
}

/** AudioContext actual (sin crearlo), o `null`. */
export function getAudioContext(): AudioContext | null {
  return zzfxX
}

/** Nodo de ganancia maestra (sin crearlo), o `null`. */
export function getMasterGainNode(): GainNode | null {
  return masterGain
}

/** Aplica volumen/mute al nodo maestro si ya existe. */
function applyMasterGain(): void {
  if (masterGain) masterGain.gain.value = muted ? 0 : masterVolume
}

/**
 * Intenta desbloquear el audio. Es seguro llamarlo siempre: nunca lanza.
 * La política de autoplay de Chromium/Electron exige un gesto del usuario.
 */
export function unlockAudio(): void {
  ensureAudioContext()
}

/**
 * Instala —una única vez— listeners de gesto (`pointerdown`/`keydown`) que
 * desbloquean el AudioContext y se auto-remueven. Complementa a
 * `ensureAudioContext`, que ya reintenta el `resume()` en cada reproducción.
 */
export function installAudioUnlock(): void {
  if (unlockInstalled) return
  const win = (
    globalThis as {
      window?: {
        addEventListener?: (
          type: string,
          listener: () => void,
          options?: { once?: boolean; capture?: boolean }
        ) => void
        removeEventListener?: (type: string, listener: () => void, capture?: boolean) => void
      }
    }
  ).window
  if (!win || typeof win.addEventListener !== 'function') return
  unlockInstalled = true

  const handler = (): void => {
    unlockAudio()
    if (typeof win.removeEventListener === 'function') {
      win.removeEventListener('pointerdown', handler, true)
      win.removeEventListener('keydown', handler, true)
    }
  }
  win.addEventListener('pointerdown', handler, { once: true, capture: true })
  win.addEventListener('keydown', handler, { once: true, capture: true })
}

// ── Volumen maestro y mute ──────────────────────────────────────────────

export function getMasterVolume(): number {
  return masterVolume
}

export function setMasterVolume(value: number): void {
  masterVolume = clamp01(value)
  persist(MASTER_VOLUME_KEY, String(masterVolume))
  applyMasterGain()
}

export function isAudioMuted(): boolean {
  return muted
}

export function setAudioMuted(value: boolean): void {
  muted = value
  persist(AUDIO_MUTED_KEY, value ? '1' : '0')
  applyMasterGain()
}

// ── Síntesis pura (sin AudioContext) ────────────────────────────────────

/**
 * Genera las muestras de un sonido ZzFX. Es pura: no toca Web Audio ni lanza.
 * Reescritura legible de `zzfx(...)` de ZzFX Micro v1.3.2, con los mismos
 * parámetros posicionales:
 *
 * `(volume, randomness, frequency, attack, sustain, release, shape,
 *   shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime,
 *   noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo)`
 *
 * `shape`: 0=sin, 1=triangle, 2=saw, 3=tan, 4=noise, 5=square duty.
 */
export function zzfxSamples(...params: number[]): Float32Array {
  const [
    volume = 1,
    randomness = 0.05,
    frequency = 220,
    attack = 0,
    sustain = 0,
    release = 0.1,
    shape = 0,
    shapeCurve = 1,
    slide = 0,
    deltaSlide = 0,
    pitchJump = 0,
    pitchJumpTime = 0,
    repeatTime = 0,
    noise = 0,
    modulation = 0,
    bitCrush = 0,
    delay = 0,
    sustainVolume = 1,
    decay = 0,
    tremolo = 0
  ] = params

  const sign = (value: number): number => (value < 0 ? -1 : 1)

  // Escalado por frecuencia de muestreo (idéntico al original).
  const attackLen = attack * ZzFX_SAMPLE_RATE || 9 // un mínimo evita el "pop"
  const decayLen = decay * ZzFX_SAMPLE_RATE
  const sustainLen = sustain * ZzFX_SAMPLE_RATE
  const releaseLen = release * ZzFX_SAMPLE_RATE
  const delayLen = delay * ZzFX_SAMPLE_RATE
  const deltaSlideScaled = (deltaSlide * 500 * TAU) / ZzFX_SAMPLE_RATE ** 3
  const modulationScaled = (modulation * TAU) / ZzFX_SAMPLE_RATE
  const pitchJumpScaled = (pitchJump * TAU) / ZzFX_SAMPLE_RATE
  const pitchJumpTimeScaled = pitchJumpTime * ZzFX_SAMPLE_RATE
  const repeatTimeScaled = (repeatTime * ZzFX_SAMPLE_RATE) | 0
  const volumeScaled = volume * ZzFX_VOLUME

  let currentSlide = (slide * 500 * TAU) / ZzFX_SAMPLE_RATE / ZzFX_SAMPLE_RATE
  const startSlide = currentSlide
  let currentFrequency =
    (frequency * (1 + randomness * 2 * Math.random() - randomness) * TAU) / ZzFX_SAMPLE_RATE
  let startFrequency = currentFrequency

  const totalLength = (attackLen + decayLen + sustainLen + releaseLen + delayLen) | 0
  const output = new Float32Array(Math.max(0, totalLength))

  const crushPeriod = (bitCrush * 100) | 0
  let crushCounter = 0
  let modCounter = 0
  let phase = 0
  let sample = 0
  let pitchJumpTimer = 1
  let repeatCounter = 0

  /** Envolvente A/D/S/R (con caída de decaimiento a `sustainVolume`). */
  const envelope = (i: number): number => {
    if (i < attackLen) return i / attackLen
    if (i < attackLen + decayLen) return 1 - ((i - attackLen) / decayLen) * (1 - sustainVolume)
    if (i < attackLen + decayLen + sustainLen) return sustainVolume
    if (i < totalLength - delayLen) {
      return ((totalLength - i - delayLen) / releaseLen) * sustainVolume
    }
    return 0
  }

  for (let i = 0; i < totalLength; i++) {
    // El bit-crush solo recalcula la onda cada `crushPeriod` muestras.
    if (!(++crushCounter % crushPeriod)) {
      let wave: number
      if (shape > 4) {
        wave = ((phase / TAU) % 1 < shapeCurve / 2 ? 1 : 0) * 2 - 1
      } else if (shape > 3) {
        wave = Math.sin(phase ** 3)
      } else if (shape > 2) {
        wave = Math.max(Math.min(Math.tan(phase), 1), -1)
      } else if (shape > 1) {
        wave = 1 - (((2 * phase) / TAU) % 2 + 2) % 2
      } else if (shape > 0) {
        wave = 1 - 4 * Math.abs(Math.round(phase / TAU) - phase / TAU)
      } else {
        wave = Math.sin(phase)
      }

      const tremoloFactor = repeatTimeScaled
        ? 1 - tremolo + tremolo * Math.sin((TAU * i) / repeatTimeScaled)
        : 1
      const curved = shape > 4 ? wave : sign(wave) * Math.abs(wave) ** shapeCurve
      let value = tremoloFactor * curved * envelope(i)

      if (delayLen) {
        value =
          delayLen > i
            ? value / 2
            : value / 2 +
              ((i < totalLength - delayLen ? 1 : (totalLength - i) / delayLen) *
                (output[(i - delayLen) | 0] ?? 0)) /
                2 /
                volumeScaled
      }
      sample = value
    }

    output[i] = sample * volumeScaled

    const increment =
      (currentFrequency += (currentSlide += deltaSlideScaled)) *
      Math.cos(modulationScaled * modCounter++)
    phase += increment + increment * noise * Math.sin(((i * i * TAU) % 2) - 1)

    if (pitchJumpTimer && ++pitchJumpTimer > pitchJumpTimeScaled) {
      currentFrequency += pitchJumpScaled
      startFrequency += pitchJumpScaled
      pitchJumpTimer = 0
    }

    if (repeatTimeScaled && !(++repeatCounter % repeatTimeScaled)) {
      currentFrequency = startFrequency
      currentSlide = startSlide
      pitchJumpTimer = pitchJumpTimer || 1
    }
  }

  return output
}

// ── Generación a AudioBuffer y reproducción ─────────────────────────────

/**
 * Genera el sonido en un `AudioBuffer` listo para reproducir (no suena solo).
 * Devuelve `null` sin lanzar cuando no hay Web Audio.
 */
export function zzfxG(...params: number[]): AudioBuffer | null {
  const ctx = ensureAudioContext()
  if (!ctx) return null
  try {
    const samples = zzfxSamples(...params)
    const buffer = ctx.createBuffer(1, samples.length, ZzFX_SAMPLE_RATE)
    buffer.getChannelData(0).set(samples)
    return buffer
  } catch {
    return null
  }
}

/**
 * Reproduce un buffer ya generado. Respeta mute/volumen maestro (pasa por la
 * ganancia maestra) y aplica un `gain` local opcional. Devuelve el nodo para
 * que el llamador pueda detenerlo, o `null` si no hay audio.
 */
export function zzfxP(
  buffer: AudioBuffer | null,
  gain = 1,
  loop = false
): AudioBufferSourceNode | null {
  if (!buffer) return null
  const ctx = ensureAudioContext()
  if (!ctx) return null
  if (muted) return null
  try {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = loop
    const gainNode = ctx.createGain()
    gainNode.gain.value = gain
    source.connect(gainNode)
    gainNode.connect(masterGain ?? ctx.destination)
    source.start()
    return source
  } catch {
    return null
  }
}

/** Genera y reproduce en un paso. */
export function zzfx(...params: number[]): void {
  const buffer = zzfxG(...params)
  if (buffer) zzfxP(buffer)
}
