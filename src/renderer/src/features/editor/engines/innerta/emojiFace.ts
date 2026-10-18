// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Ranura de EMOJI del motor.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUIÉN DECIDE
 *
 * El que decide si un carácter sale a COLOR o MONOCROMO es **lo que mandó el
 * CLI / el archivo**, no nosotros. Y eso lo resuelve el MOTOR, code point por
 * code point:
 *
 *   - presentación EMOJI por defecto (`Emoji_Presentation`, p. ej. `⚡ ✅ ✨ 😀`),
 *     o el carácter seguido de VS16 (U+FE0F)  → fuente de emoji A COLOR.
 *   - el resto, incluidos los símbolos de presentación TEXTO que usan los CLIs
 *     (`⚙ ✓ ❤ ☀ ⚠ ℹ`)                        → cadena normal, MONOCROMO.
 *
 * Acá sólo se le da al motor la fuente de emoji del sistema, UNA vez por vista
 * y bajo demanda.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LO QUE HACÍA ANTES (y por qué se borró)
 *
 * Este archivo rasterizaba los emoji EN EL NAVEGADOR por RANGO
 * (`U+2600..U+27BF`, etc.) y los empujaba con `setHostGlyph`, dejando
 * `"Noto Color Emoji"` primero. Eso convertía en emoji a color símbolos que el
 * CLI había escrito como TEXTO (p. ej. el `⚙` U+2699 del welcome de un CLI, que
 * es presentación texto y no lleva VS16): el glifo del navegador ganaba sobre el
 * monocromo de la cadena. Era el mismo bug de "por rango" que se arregló en el
 * motor, del lado del host. Ya no se rasteriza nada acá.
 */

import type { InnertaModule } from './InnertaEngine'
import { api } from '@services/api'

/** ¿El texto trae algún carácter de presentación EMOJI? (para ir a buscarla) */
const EMOJI_PRESENTATION = /\p{Emoji_Presentation}/u

/** Ruta dentro del FS del WASM (el motor sólo ve rutas, no bytes). */
const FONT_PATH = '/fonts/terminal/emoji.ttf'

interface TerminalApi {
  getEmojiFont?: () => Promise<{ data: Uint8Array } | null>
}

function getApi(): TerminalApi | null {
  return (api?.terminal as TerminalApi | undefined) ?? null
}

/** La fuente, una sola vez por renderer (pesa ~10 MB). */
let fontBytes: Uint8Array | null = null
let fetching: Promise<Uint8Array | null> | null = null
/** Vistas que ya la tienen aplicada (no se reescribe el FS en cada tecla). */
const applied = new WeakSet<InnertaModule>()
/** Timer del debounce del camino de tecleo. */
let timer: ReturnType<typeof setTimeout> | undefined
let pendingText = ''
let pendingModule: InnertaModule | null = null

async function apply(module: InnertaModule): Promise<void> {
  if (applied.has(module)) return
  const fs = (module as unknown as { FS?: { writeFile: (p: string, d: Uint8Array) => void } })
    .FS
  const api = getApi()
  if (!fs || !api?.getEmojiFont) return
  applied.add(module)
  try {
    if (!fontBytes) {
      fetching ??= api.getEmojiFont().then((f) => f?.data ?? null)
      fontBytes = await fetching
    }
    if (!fontBytes || fontBytes.length === 0) return
    fs.writeFile(FONT_PATH, fontBytes)
    // El motor la usa SÓLO para los code points de presentación emoji.
    module.setTerminalEmojiFont?.(FONT_PATH)
  } catch {
    // Sin fuente de emoji: los emoji salen monocromos de la cadena, como en una
    // terminal que no tiene ninguna instalada. Se permite reintentar.
    applied.delete(module)
  }
}

/** Aplica la ranura ya (sin debounce). */
export function pushEmojiFace(module: InnertaModule | null, text: string): void {
  if (!module?.setTerminalEmojiFont || !text) return
  void apply(module)
}

/**
 * Camino de tecleo: escanear el texto entero en cada carácter es de más; 250 ms
 * después de la última edición alcanza. Sólo se va a buscar la fuente si el
 * texto trae algún carácter de presentación emoji.
 */
export function scheduleEmojiFace(module: InnertaModule | null, text: string): void {
  if (!module || !text || !EMOJI_PRESENTATION.test(text)) return
  pendingModule = module
  pendingText = text
  if (timer) return
  timer = setTimeout(() => {
    timer = undefined
    pushEmojiFace(pendingModule, pendingText)
    pendingModule = null
    pendingText = ''
  }, 250)
}

/** Para tests: olvida lo cacheado. */
export function _resetEmojiFaceForTests(): void {
  fontBytes = null
  fetching = null
}
