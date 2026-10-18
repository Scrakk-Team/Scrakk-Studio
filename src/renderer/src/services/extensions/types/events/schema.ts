// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Eventos SEF — validación/normalización del slice del manifest y de la escena.
 *
 * Tolerante, como el resto del sistema: una op inválida se DESCARTA con un
 * warning y la escena sigue con el resto. Nunca se cae la app por un pack roto.
 *
 * Regla de seguridad: acá NO entra CSS arbitrario. Los colores se validan; el
 * resto son números y strings acotados. La geometría (el path SVG) es datos
 * para `Path2D`, no marcado: no puede escapar del canvas.
 */

import type { EventSchedule, EventShape, EventScene, EventOp } from '@shared/events'
import { EVENT_SPEC_VERSION } from '@shared/events'
import type { ParseContext } from '../handler'

/** Un evento tal como lo declara `contributes.events`. */
export interface EventContribution {
  id: string
  name: string
  /** Ruta al JSON de la escena dentro del paquete. */
  path?: string
  /** Escena INLINE (builtins y tests; sin archivo en disco). */
  scene?: unknown
}

const OPS = new Set([
  'stage.fog',
  'stage.tint',
  'stage.vignette',
  'stage.shake',
  'overlay.emit',
  'emit',
  'audio.play',
  'audio.ambience',
  'audio.stop',
  'notify',
  'status.add',
  'theme.set'
])

/** Color seguro: token del tema, hex, rgb()/rgba()/hsl() o `transparent`. */
const TOKEN = /^[a-z][a-zA-Z0-9]*$/
const CSS_COLOR =
  /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\([\d.,%\s/]+\)|hsla?\([\d.,%\s/deg]+\)|transparent)$/i

/** Token del tema conocido (el motor lo resuelve a su variable CSS). */
const TOKENS = new Set([
  'accent',
  'text',
  'textMuted',
  'textSecondary',
  'border',
  'bg',
  'surface',
  'error',
  'warning',
  'success',
  'info'
])

export function isEffectColor(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const s = value.trim()
  return TOKENS.has(s) || TOKEN.test(s) || CSS_COLOR.test(s)
}

/** Token conocido → color CSS válido (para que el motor no adivine). */
export { TOKENS as EFFECT_COLOR_TOKENS }

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v : undefined

function normalizePoint(v: unknown): [number | string, number | string] | undefined {
  if (!Array.isArray(v) || v.length !== 2) return undefined
  const out: [number | string, number | string] = [0, 0]
  for (let i = 0; i < 2; i++) {
    const p = v[i]
    if (typeof p === 'number' && Number.isFinite(p)) out[i] = p
    else if (typeof p === 'string' && /^-?[\d.]+(vw|vh|%|px)?$/.test(p.trim())) out[i] = p.trim()
    else return undefined
  }
  return out
}

/** Un `d` de path es datos para Path2D: sólo comandos y números. */
function safePath(value: unknown): string | null {
  const path = str(value)
  if (!path || path.length > 4000 || /[<>]/.test(path)) return null
  return path
}

function normalizeShape(raw: unknown): EventShape | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const path = safePath(r.path)
  if (!path) return null
  const shape: EventShape = { path }
  const wing = safePath(r.wing)
  if (wing) shape.wing = wing
  const clip = r.wingClip
  if (Array.isArray(clip) && clip.length === 2) {
    const x0 = num(clip[0])
    const x1 = num(clip[1])
    if (x0 !== undefined && x1 !== undefined && x1 > x0) shape.wingClip = [x0, x1]
  }
  const anchor = normalizePoint(r.wingAnchor)
  if (anchor && typeof anchor[0] === 'number' && typeof anchor[1] === 'number') {
    shape.wingAnchor = [anchor[0], anchor[1]]
  }
  const vb = r.viewBox
  if (Array.isArray(vb) && vb.length === 2) {
    const w = num(vb[0])
    const h = num(vb[1])
    if (w && h && w > 0 && h > 0) shape.viewBox = [w, h]
  }
  if (isEffectColor(r.fill)) shape.fill = r.fill
  if (isEffectColor(r.stroke)) shape.stroke = r.stroke
  const width = num(r.width)
  if (width !== undefined && width > 0 && width <= 32) shape.width = width
  return shape
}

/** Valida y normaliza UNA op. Devuelve null si es basura. */
function normalizeOp(raw: unknown): EventOp | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const op = str(r.op)
  if (!op || !OPS.has(op)) {
    console.warn('[extensions/events] op desconocida descartada:', r.op)
    return null
  }

  const out: EventOp = { op: op as EventOp['op'] }
  const at = num(r.at)
  if (at !== undefined && at >= 0) out.at = at

  switch (op) {
    case 'stage.fog':
    case 'stage.vignette': {
      const amount = num(r.amount)
      out.amount = amount === undefined ? (op === 'stage.fog' ? 0.4 : 0.5) : clamp01(amount)
      if (op === 'stage.fog' && isEffectColor(r.tint)) out.tint = r.tint
      const fade = num(r.fade)
      out.fade = fade === undefined ? 1200 : Math.max(0, Math.min(30_000, fade))
      return out
    }
    case 'stage.tint': {
      if (!isEffectColor(r.tint)) {
        console.warn('[extensions/events] stage.tint sin color válido — descartada')
        return null
      }
      out.tint = r.tint
      const amount = num(r.amount)
      out.amount = amount === undefined ? 0.25 : clamp01(amount)
      const fade = num(r.fade)
      out.fade = fade === undefined ? 1200 : Math.max(0, Math.min(30_000, fade))
      return out
    }
    case 'stage.shake': {
      const intensity = num(r.intensity)
      out.intensity = intensity === undefined ? 3 : Math.max(0, Math.min(24, intensity))
      const duration = num(r.duration)
      out.duration = duration === undefined ? 400 : Math.max(50, Math.min(5000, duration))
      return out
    }
    case 'overlay.emit': {
      const event = str(r.event)
      if (!event) {
        console.warn('[extensions/events] overlay.emit sin `event` — descartada')
        return null
      }
      out.event = event
      if (r.anchor === 'lowest' || r.anchor === 'center-bottom') out.anchor = r.anchor
      return out
    }
    case 'emit': {
      const draw = normalizeShape(r.draw)
      if (!draw) {
        console.warn('[extensions/events] emit sin `draw` válido — descartada')
        return null
      }
      out.draw = draw
      const count = num(r.count)
      out.count = count === undefined ? 1 : Math.max(1, Math.min(200, Math.floor(count)))
      const jitter = num(r.jitter)
      if (jitter !== undefined) out.jitter = clamp01(jitter)
      const spread = num(r.spread)
      if (spread !== undefined) out.spread = clamp01(spread)
      const bank = num(r.bank)
      if (bank !== undefined) out.bank = Math.max(0, Math.min(60, bank))
      const size = num(r.size)
      out.size = size === undefined ? 10 : Math.max(1, Math.min(600, size))
      const rotate = num(r.rotate)
      if (rotate !== undefined) out.rotate = Math.max(-360, Math.min(360, rotate))
      const flapHz = num(r.flapHz)
      if (flapHz !== undefined) out.flapHz = Math.max(0, Math.min(30, flapHz))
      const life = num(r.life)
      out.life = life === undefined ? 6000 : Math.max(200, Math.min(120_000, life))
      const every = num(r.every)
      if (every !== undefined) out.every = Math.max(0, Math.min(10_000, every))
      if (r.alpha === 'flash') out.alpha = 'flash'

      const motion = r.motion
      if (motion && typeof motion === 'object') {
        const m = motion as Record<string, unknown>
        const from = normalizePoint(m.from)
        const to = normalizePoint(m.to)
        const through = normalizePoint(m.through)
        const drift = normalizePoint(m.drift)
        if (from || to || through || drift) {
          out.motion = {}
          if (from) out.motion.from = from
          if (to) out.motion.to = to
          if (through) out.motion.through = through
          if (drift) out.motion.drift = drift as [number, number]
          const bob = num(m.bob)
          if (bob !== undefined) out.motion.bob = Math.max(0, Math.min(200, bob))
          const bobHz = num(m.bobHz)
          if (bobHz !== undefined) out.motion.bobHz = Math.max(0.05, Math.min(10, bobHz))
          if (m.easing === 'linear' || m.easing === 'ease' || m.easing === 'ease-in' || m.easing === 'ease-out') {
            out.motion.easing = m.easing
          }
        }
      }
      return out
    }
    case 'audio.play':
    case 'audio.ambience': {
      const sound = str(r.sound)
      if (!sound) {
        console.warn(`[extensions/events] ${op} sin \`sound\` — descartada`)
        return null
      }
      out.sound = sound
      const gain = num(r.gain)
      if (gain !== undefined) out.amount = clamp01(gain)
      const fade = num(r.fade)
      if (fade !== undefined && fade >= 0 && fade <= 30_000) out.fade = fade
      return out
    }
    case 'audio.stop':
      return out
    case 'notify': {
      const title = str(r.title)
      const message = str(r.message)
      if (!title && !message) {
        console.warn('[extensions/events] notify sin título ni mensaje — descartada')
        return null
      }
      if (title) out.title = title
      if (message) out.message = message
      if (r.severity === 'info' || r.severity === 'success' || r.severity === 'warn' || r.severity === 'error') {
        out.severity = r.severity
      }
      return out
    }
    case 'status.add': {
      const text = str(r.text)
      if (!text) {
        console.warn('[extensions/events] status.add sin `text` — descartada')
        return null
      }
      out.text = text
      if (str(r.icon)) out.icon = r.icon as string
      const ttl = num(r.ttl)
      if (ttl !== undefined) out.ttl = Math.max(0, Math.min(24 * 3600 * 1000, ttl))
      return out
    }
    case 'theme.set': {
      const theme = str(r.theme)
      if (!theme) {
        console.warn('[extensions/events] theme.set sin `theme` — descartada')
        return null
      }
      out.theme = theme
      return out
    }
    default:
      return null
  }
}

function normalizeSchedule(raw: unknown): EventSchedule | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const out: EventSchedule = {}
  if (typeof r.from === 'string' && r.from.trim()) out.from = r.from.trim()
  if (typeof r.until === 'string' && r.until.trim()) out.until = r.until.trim()
  if (typeof r.minEngine === 'string' && r.minEngine.trim()) out.minEngine = r.minEngine.trim()
  return out.from || out.until || out.minEngine ? out : undefined
}

/**
 * Normaliza la ESCENA de un evento (el JSON que apunta el pack, o el inline).
 * Devuelve null si no es una escena usable (sin `timeline`).
 */
export function normalizeEventScene(raw: unknown): EventScene | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const specVersion = num(r.specVersion) ?? EVENT_SPEC_VERSION
  if (!num(r.specVersion)) {
    console.warn('[extensions/events] escena sin `specVersion` — se asume la actual')
  }

  const timelineRaw = Array.isArray(r.timeline) ? r.timeline : null
  if (!timelineRaw) {
    console.warn('[extensions/events] escena sin `timeline` — descartada')
    return null
  }
  const timeline = timelineRaw.map(normalizeOp).filter((o): o is EventOp => o !== null)
  if (timeline.length === 0) {
    console.warn('[extensions/events] escena sin ninguna op válida — descartada')
    return null
  }
  // Orden estable por `at`: el runtime además lo garantiza, pero así el JSON no
  // tiene que venir ordenado a mano.
  timeline.sort((a, b) => (a.at ?? 0) - (b.at ?? 0))

  const scene: EventScene = { specVersion, timeline }

  const schedule = normalizeSchedule(r.schedule)
  if (schedule) scene.schedule = schedule

  const act = r.activation
  if (act && typeof act === 'object') {
    const a = act as Record<string, unknown>
    const activation: EventScene['activation'] = {}
    if (a.mode === 'auto' || a.mode === 'notify' || a.mode === 'manual') activation.mode = a.mode
    if (typeof a.once === 'boolean') activation.once = a.once
    if (num(a.priority) !== undefined) activation.priority = num(a.priority)
    if (Object.keys(activation).length > 0) scene.activation = activation
  }

  const intensity = num(r.intensity)
  if (intensity !== undefined) scene.intensity = clamp01(intensity)
  const durationMs = num(r.durationMs)
  if (durationMs !== undefined && durationMs > 0) scene.durationMs = durationMs

  if (str(r.overlay)) scene.overlay = r.overlay as string
  if (str(r.background)) scene.background = r.background as string

  if (r.override && typeof r.override === 'object') {
    const o = r.override as Record<string, unknown>
    if (str(o.theme)) scene.override = { theme: o.theme as string }
  }

  if (r.sounds && typeof r.sounds === 'object') {
    const sounds: NonNullable<EventScene['sounds']> = {}
    for (const [key, value] of Object.entries(r.sounds as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const s = value as Record<string, unknown>
      const sound: NonNullable<EventScene['sounds']>[string] = {}

      // Un sonido es un ARCHIVO del paquete o parámetros de ZzFX (8 bits).
      const file = str(s.file)
      if (file) {
        // Relativo y dentro del paquete: ni absoluto ni con `..` (el runtime
        // además lo resuelve contra la raíz REAL del paquete).
        if (file.startsWith('/') || file.includes('..') || !/\.(ogg|oga|opus|mp3|wav|m4a|webm)$/i.test(file)) {
          console.warn(`[extensions/events] sonido "${key}": archivo inválido (${file})`)
          continue
        }
        sound.file = file
      } else if (Array.isArray(s.zzfx)) {
        const zzfx = s.zzfx.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
        if (zzfx.length === 0 || zzfx.length > 40) continue
        sound.zzfx = zzfx
      } else {
        console.warn(`[extensions/events] sonido "${key}" sin \`file\` ni \`zzfx\` — descartado`)
        continue
      }

      const gain = num(s.gain)
      if (gain !== undefined) sound.gain = clamp01(gain)
      if (s.loop === true) sound.loop = true
      sounds[key] = sound
    }
    if (Object.keys(sounds).length > 0) scene.sounds = sounds
  }

  if (r.strings && typeof r.strings === 'object') {
    const strings: Record<string, string> = {}
    for (const [key, value] of Object.entries(r.strings as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) strings[key] = value
    }
    if (Object.keys(strings).length > 0) scene.strings = strings
  }

  if (Array.isArray(r.onStop)) {
    const onStop = r.onStop.map(normalizeOp).filter((o): o is EventOp => o !== null)
    if (onStop.length > 0) scene.onStop = onStop
  }

  return scene
}

/** Valida el slice `contributes.events` del manifest. */
export function parseEventContributions(
  raw: unknown,
  _ctx: ParseContext
): EventContribution[] | null {
  if (!Array.isArray(raw)) {
    console.warn('[extensions/events] `contributes.events` debe ser un array')
    return null
  }
  const out: EventContribution[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      console.warn('[extensions/events] contribución inválida descartada:', item)
      continue
    }
    const c = item as Partial<EventContribution>
    if (typeof c.id !== 'string' || typeof c.name !== 'string' || !c.id.trim() || !c.name.trim()) {
      console.warn('[extensions/events] contribución sin `id`/`name` — descartada:', c)
      continue
    }
    const contribution: EventContribution = { id: c.id.trim(), name: c.name.trim() }
    if (typeof c.path === 'string' && c.path.trim()) contribution.path = c.path.trim()
    if (c.scene !== undefined) contribution.scene = c.scene
    if (!contribution.path && contribution.scene === undefined) {
      console.warn(`[extensions/events] "${contribution.id}" sin \`path\` ni \`scene\` — descartada`)
      continue
    }
    out.push(contribution)
  }
  return out
}
