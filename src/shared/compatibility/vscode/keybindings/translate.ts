// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Traductor de `keybindings.json` de VS Code → atajos de Scrakk.
 *
 * Puro y sin DOM: recibe el texto (JSON con comentarios) y devuelve una lista
 * con el resultado de CADA entrada. La UI muestra esa lista antes de aplicar
 * nada (vista previa) y solo escribe los `status: 'ok'`.
 *
 * Qué se traduce y qué no (honesto, sin no-ops):
 *  - Combinaciones simples y **chords** (`ctrl+k ctrl+s`): sí (el motor los
 *    soporta desde la misma sintaxis con espacio).
 *  - `when`: NO. Un atajo condicionado por contexto aplicado como global cambia
 *    el comportamiento; se reporta para que el usuario decida.
 *  - `-command` (quitar un atajo por defecto): NO. No tenemos "desbind" de los
 *    defaults; se reporta.
 *  - Overrides `mac`: se ignoran (Scrakk no soporta macOS). `win`/`linux` sí.
 *  - Comandos sin equivalente en Scrakk: se reportan como `no-command`.
 */

import { parseJsonc } from '../jsonc'
import { VSCODE_KEYBINDING_COMMANDS } from './commands'

export type TranslateStatus =
  | 'ok'
  | 'no-command'
  | 'when'
  | 'negative'
  | 'mac-only'
  | 'invalid-key'
  | 'invalid-entry'

export interface TranslatedBinding {
  /** Tecla tal cual venía (para mostrar en la previa). */
  sourceKey: string
  /** Comando de VS Code tal cual venía. */
  sourceCommand: string
  /** Nuestro comando (null si no hay equivalente). */
  command: string | null
  /** Combo canónico final (solo cuando `status === 'ok'`). */
  combo: string | null
  status: TranslateStatus
  /** Motivo legible (para la previa). */
  reason?: string
}

export interface TranslateKeybindingsResult {
  bindings: TranslatedBinding[]
  stats: Record<TranslateStatus, number>
  /** Error de parseo del archivo (si lo hubo). */
  error?: string
}

export type KeymapPlatform = 'win' | 'linux'

/** Orden canónico de modificadores: el mismo que produce el motor. */
const MODIFIER_ORDER = ['ctrl', 'alt', 'shift', 'meta'] as const

/** `'Ctrl+Shift+P'` → `'ctrl+shift+p'`; un chord conserva el espacio. */
function canonicalCombo(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => {
      const parts = segment.split('+').filter(Boolean)
      const keyPart = parts[parts.length - 1] ?? ''
      const modifiers = new Set(
        parts.slice(0, -1).map((modifier) => {
          if (modifier === 'control') return 'ctrl'
          if (modifier === 'win' || modifier === 'super') return 'meta'
          return modifier
        })
      )
      const ordered = MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier))
      return [...ordered, keyPart].join('+')
    })
    .join(' ')
}

/** Plataforma para elegir `win`/`linux` del JSON (macOS no se soporta). */
export function detectKeymapPlatform(): KeymapPlatform {
  if (typeof navigator !== 'undefined' && /Win/i.test(navigator.platform ?? '')) return 'win'
  return 'linux'
}

/** Teclas con nombre que nuestro motor conoce (además de caracteres sueltos). */
const NAMED_KEYS = new Set([
  'escape',
  'esc',
  'tab',
  'enter',
  'return',
  'space',
  'backspace',
  'delete',
  'del',
  'insert',
  'ins',
  'home',
  'end',
  'pageup',
  'pgup',
  'pagedown',
  'pgdn',
  'up',
  'down',
  'left',
  'right',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'capslock',
  'numpad0',
  'numpad1',
  'numpad2',
  'numpad3',
  'numpad4',
  'numpad5',
  'numpad6',
  'numpad7',
  'numpad8',
  'numpad9'
])

/**
 * Normaliza la tecla de VS Code a nuestra sintaxis.
 *
 * Devuelve el combo canónico o un motivo de rechazo. Un chord (con espacio) se
 * valida segmento por segmento.
 */
export function translateKey(
  key: string
): { combo: string } | { reason: string; status: Extract<TranslateStatus, 'mac-only' | 'invalid-key'> } {
  const segments = key.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (segments.length === 0) return { reason: 'vacía', status: 'invalid-key' }

  for (const segment of segments) {
    const parts = segment.split('+').filter(Boolean)
    const keyPart = parts[parts.length - 1] ?? ''

    for (const modifier of parts.slice(0, -1)) {
      // macOS: no se soporta, y `cmd`/`meta` de Mac no tienen equivalente acá.
      if (modifier === 'cmd' || modifier === 'command' || modifier === 'meta') {
        return { reason: 'atajo de macOS', status: 'mac-only' }
      }
      if (!['ctrl', 'control', 'alt', 'shift', 'win', 'super'].includes(modifier)) {
        return { reason: `modificador desconocido "${modifier}"`, status: 'invalid-key' }
      }
    }

    // Las teclas OEM dependen del layout físico: no hay mapeo confiable.
    if (keyPart.startsWith('oem_')) {
      return { reason: `tecla dependiente del layout "${keyPart}"`, status: 'invalid-key' }
    }
    const known = keyPart.length === 1 || NAMED_KEYS.has(keyPart) || /^f\d{1,2}$/.test(keyPart)
    if (!known) return { reason: `tecla desconocida "${keyPart}"`, status: 'invalid-key' }
  }

  // `win`/`super` (tecla Windows) → `meta`, que es lo que entiende el motor.
  const normalized = segments
    .map((segment) => segment.replace(/\b(win|super)\b/g, 'meta'))
    .join(' ')

  return { combo: canonicalCombo(normalized) }
}

interface RawBinding {
  key?: unknown
  command?: unknown
  when?: unknown
  mac?: unknown
  win?: unknown
  linux?: unknown
}

/**
 * Traduce el contenido de un `keybindings.json`.
 *
 * `platform` elige el override `win`/`linux`; los `mac` se ignoran.
 */
export function translateKeybindings(
  text: string,
  options: { platform?: KeymapPlatform } = {}
): TranslateKeybindingsResult {
  const platform = options.platform ?? detectKeymapPlatform()
  const stats: Record<TranslateStatus, number> = {
    ok: 0,
    'no-command': 0,
    when: 0,
    negative: 0,
    'mac-only': 0,
    'invalid-key': 0,
    'invalid-entry': 0
  }
  const bindings: TranslatedBinding[] = []

  let parsed: unknown
  try {
    parsed = parseJsonc(text)
  } catch (error) {
    return {
      bindings,
      stats,
      error: `No se pudo leer el JSON: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  if (!Array.isArray(parsed)) {
    return { bindings, stats, error: 'El archivo no es un array de atajos.' }
  }

  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      bindings.push({ sourceKey: '', sourceCommand: '', command: null, combo: null, status: 'invalid-entry' })
      stats['invalid-entry'] += 1
      continue
    }

    const entry = raw as RawBinding
    // El override de la plataforma manda sobre `key`.
    const platformKey =
      platform === 'win' ? entry.win : entry.linux
    const effectiveKey = typeof platformKey === 'string' ? platformKey : entry.key
    const sourceKey = typeof effectiveKey === 'string' ? effectiveKey : ''
    const sourceCommand = typeof entry.command === 'string' ? entry.command : ''

    const push = (status: TranslateStatus, extra: Partial<TranslatedBinding> = {}): void => {
      bindings.push({ sourceKey, sourceCommand, command: null, combo: null, status, ...extra })
      stats[status] += 1
    }

    if (!sourceCommand) {
      push('invalid-entry', { reason: 'sin "command"' })
      continue
    }
    if (sourceCommand.startsWith('-')) {
      push('negative', { reason: 'quita un atajo por defecto (no soportado)' })
      continue
    }
    if (entry.when !== undefined) {
      push('when', { reason: 'condicionado por "when" (contexto)' })
      continue
    }
    if (!sourceKey) {
      push('invalid-entry', { reason: 'sin "key"' })
      continue
    }

    const key = translateKey(sourceKey)
    if ('reason' in key) {
      push(key.status, { reason: key.reason })
      continue
    }

    const command = VSCODE_KEYBINDING_COMMANDS[sourceCommand] ?? null
    if (!command) {
      push('no-command', { reason: 'Scrakk no tiene ese comando' })
      continue
    }

    push('ok', { command, combo: key.combo })
  }

  return { bindings, stats }
}
