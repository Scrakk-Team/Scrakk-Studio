// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del motor de audio sintetizado (ZzFX + mixer).
 *
 * Node no trae Web Audio, así que acá se cubren las partes PURAS y los caminos
 * de seguridad: persistencia de volumen/mute, clamp, y que todas las funciones
 * de reproducción sean no-op seguras (nunca lancen) sin `AudioContext`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Stub de localStorage ANTES de tocar el storage (los accesos son en runtime).
const mem = new Map<string, string>()
vi.stubGlobal('window', {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size
    }
  }
})

import {
  AUDIO_MUTED_KEY,
  MASTER_VOLUME_KEY,
  getMasterVolume,
  installAudioUnlock,
  isAudioMuted,
  setAudioMuted,
  setMasterVolume,
  unlockAudio,
  zzfx,
  zzfxG,
  zzfxP,
  zzfxSamples
} from '@services/audio/zzfx'
import {
  dataUriToBytes,
  duckFor,
  getActiveSoundCountForTests,
  getAmbienceCountForTests,
  playSound,
  resetMixerForTests,
  startAmbience,
  stopAll,
  stopAmbience
} from '@services/audio/mixer'

const VOLUME = MASTER_VOLUME_KEY
const MUTED = AUDIO_MUTED_KEY

afterEach(() => {
  resetMixerForTests()
  setMasterVolume(1)
  setAudioMuted(false)
  mem.clear()
})

describe('zzfx sin Web Audio', () => {
  it('no hay AudioContext en Node', () => {
    expect(typeof AudioContext).toBe('undefined')
  })

  it('zzfxG devuelve null y no lanza', () => {
    expect(() => zzfxG(1, 0.3, 440)).not.toThrow()
    expect(zzfxG(1, 0.3, 440)).toBeNull()
  })

  it('zzfxP(null) → null', () => {
    expect(zzfxP(null)).toBeNull()
  })

  it('zzfx() es no-op seguro', () => {
    expect(() => zzfx(1, 0.1, 220)).not.toThrow()
  })

  it('zzfxSamples genera muestras finitas (parte pura)', () => {
    const samples = zzfxSamples(1, 0.05, 440, 0, 0, 0.1)
    expect(samples.length).toBeGreaterThan(0)
    for (const s of samples) expect(Number.isFinite(s)).toBe(true)
  })

  it('unlockAudio/installAudioUnlock no lanzan', () => {
    expect(() => unlockAudio()).not.toThrow()
    expect(() => installAudioUnlock()).not.toThrow()
    expect(() => installAudioUnlock()).not.toThrow()
  })
})

describe('volumen maestro', () => {
  it('persiste bajo la clave cruda', () => {
    setMasterVolume(0.42)
    expect(getMasterVolume()).toBeCloseTo(0.42, 5)
    expect(mem.get(VOLUME)).toBe('0.42')
  })

  it('clampa a 0..1', () => {
    setMasterVolume(2)
    expect(getMasterVolume()).toBe(1)
    setMasterVolume(-0.5)
    expect(getMasterVolume()).toBe(0)
    setMasterVolume(Number.NaN)
    expect(getMasterVolume()).toBe(1)
  })
})

describe('mute global', () => {
  it('persiste como 1/0 bajo la clave cruda', () => {
    setAudioMuted(true)
    expect(isAudioMuted()).toBe(true)
    expect(mem.get(MUTED)).toBe('1')
    setAudioMuted(false)
    expect(isAudioMuted()).toBe(false)
    expect(mem.get(MUTED)).toBe('0')
  })
})

describe('mixer sin AudioContext', () => {
  beforeEach(() => {
    resetMixerForTests()
  })

  it('playSound devuelve null sin audio', () => {
    expect(playSound({ zzfx: [1, 0.1, 220], gain: 0.8 })).toBeNull()
    expect(getActiveSoundCountForTests()).toBe(0)
  })

  it('startAmbience dos veces con la misma etiqueta no apila', () => {
    startAmbience('editor', { zzfx: [1, 0.05, 110], gain: 0.4 })
    startAmbience('editor', { zzfx: [1, 0.05, 110], gain: 0.4 })
    expect(getAmbienceCountForTests()).toBe(1)
  })

  it('etiquetas distintas se cuentan por separado', () => {
    startAmbience('editor', { zzfx: [1, 0, 110] })
    startAmbience('chat', { zzfx: [1, 0, 220] })
    expect(getAmbienceCountForTests()).toBe(2)
  })

  it('stopAmbience libera la etiqueta para reiniciar', () => {
    startAmbience('editor', { zzfx: [1, 0, 110] })
    stopAmbience('editor')
    expect(getAmbienceCountForTests()).toBe(0)
    startAmbience('editor', { zzfx: [1, 0, 110] })
    expect(getAmbienceCountForTests()).toBe(1)
  })

  it('stopAll y duckFor son no-op seguras', () => {
    startAmbience('editor', { zzfx: [1, 0, 110] })
    expect(() => stopAll()).not.toThrow()
    expect(getAmbienceCountForTests()).toBe(0)
    expect(() => stopAmbience()).not.toThrow()
    expect(() => duckFor(200)).not.toThrow()
  })
})

/**
 * `data:` → bytes, en memoria.
 *
 * Es el camino REAL del audio de un evento: el pack trae el `.ogg`, el runtime
 * lo lee y arma un `data:` con el mime. Se decodifica a mano porque el CSP del
 * renderer bloquea `fetch()` de `data:`: cuando esto se hacía con `fetch`, el
 * sonido no salía NUNCA y el fallo era mudo.
 */
describe('dataUriToBytes', () => {
  it('decodifica base64 con su mime', () => {
    // "OggS" en base64 = T2dnUw==
    const bytes = dataUriToBytes('data:audio/ogg;base64,T2dnUw==')
    expect(bytes).not.toBeNull()
    expect([...bytes!]).toEqual([0x4f, 0x67, 0x67, 0x53])
  })

  it('rechaza lo que no es base64 o no es un data:', () => {
    expect(dataUriToBytes('data:audio/ogg,sin-base64')).toBeNull()
    expect(dataUriToBytes('https://ejemplo.com/a.ogg')).toBeNull()
    expect(dataUriToBytes('data:audio/ogg;base64,no-es-base64!!')).toBeNull()
    expect(dataUriToBytes('')).toBeNull()
  })
})
