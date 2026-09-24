/**
 * Emoji en COLOR — los rasteriza el HOST y el motor los pinta.
 *
 * Por qué acá y no en el motor: en WASM no hay fontconfig ni fuentes del
 * sistema, y las de emoji son bitmaps de color (CBDT) que FreeType no entrega a
 * 16 px sin elegir el strike y reescalar. El navegador ya sabe hacerlo (color,
 * tamaño, y hasta composición de secuencias). Es el mismo reparto que con los
 * tokens, subrayados o la indentación: **el host resuelve, el motor pinta**.
 *
 * Se rasteriza a un canvas, se cachea por code point + tamaño y se empuja con
 * `module.setHostGlyph`. Si el canvas no dibuja nada (no hay fuente de emoji),
 * NO se empuja: así el motor cae a las fuentes embebidas en vez de dejar el
 * carácter invisible.
 */

import type { InnertaModule } from './InnertaEngine'

/** Candidatas de fuente de emoji, en orden (Linux/macOS/Windows). */
function emojiFont(px: number): string {
  // La empaquetada gana: el rasterizado no depende de qué tenga el SO.
  return `${px}px "ScrakkEmoji","Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji","Twemoji Mozilla","EmojiOne Color",sans-serif`
}

// ── Fuente de emoji empaquetada (Twemoji Mozilla, COLR) ────────────────────
// Se carga una sola vez como webfont y se usa para rasterizar. Sin esto, el
// resultado dependía de la fuente de emoji del sistema (o no había ninguna).
let fontReady = false
let fontLoading: Promise<void> | null = null
let pendingAfterFont = ''
let pendingModule: InnertaModule | null = null

function loadEmojiFont(): Promise<void> {
  if (fontLoading) return fontLoading
  fontLoading = (async () => {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined') return
    const url = new URL('fonts/emoji/Twemoji.Mozilla.ttf', document.baseURI).href
    const face = new FontFace('ScrakkEmoji', `url("${url}")`)
    await face.load()
    document.fonts.add(face)
    fontReady = true
    // Lo que se pidió mientras cargaba, ahora sí.
    if (pendingAfterFont && pendingModule) {
      const text = pendingAfterFont
      const module = pendingModule
      pendingAfterFont = ''
      rasterized.clear()
      pushEmojiGlyphsFor(module, text)
    }
  })().catch(() => {
    // Sin la empaquetada se sigue con las del SO (o el respaldo embebido).
  })
  return fontLoading
}

// Arranca la carga ya: el primer archivo con emoji no la espera.
void loadEmojiFont()

/** ¿Vale la pena rasterizarlo en el host (emoji de color del sistema)? */
function isEmoji(codepoint: number): boolean {
  return (
    (codepoint >= 0x1f000 && codepoint <= 0x1faff) || // SMP: caras, símbolos, objetos
    (codepoint >= 0x2600 && codepoint <= 0x27bf) || // BMP: símbolos y dingbats
    (codepoint >= 0x2b00 && codepoint <= 0x2bff) // flechas/símbolos varios
  )
}

/** Modificadores/selectores que no se dibujan solos (tonos, ZWJ, VS16). */
function isModifier(codepoint: number): boolean {
  return (
    codepoint === 0x200d ||
    (codepoint >= 0xfe00 && codepoint <= 0xfe0f) ||
    (codepoint >= 0x1f3fb && codepoint <= 0x1f3ff)
  )
}

const rasterized = new Set<string>()
let scratch: HTMLCanvasElement | null = null
let pushTimer: ReturnType<typeof setTimeout> | undefined
let pendingText = ''

/** Rasteriza un code point a RGBA straight-alpha (o `null` si no dibuja nada). */
function rasterize(codepoint: number, size: number): Uint8Array | null {
  if (typeof document === 'undefined') return null
  if (!scratch) scratch = document.createElement('canvas')
  const canvas = scratch
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  ctx.clearRect(0, 0, size, size)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = emojiFont(size)
  ctx.fillText(String.fromCodePoint(codepoint), size / 2, size / 2)

  const data = ctx.getImageData(0, 0, size, size).data
  let painted = false
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) {
      painted = true
      break
    }
  }
  if (!painted) return null
  return new Uint8Array(data.buffer.slice(0))
}

/** Empuja al motor los emoji del texto (una vez por code point y tamaño). */
function pushEmojiGlyphsFor(module: InnertaModule, text: string): void {
  const size = Math.max(8, Math.round(module.getLineHeight?.() ?? 16))

  const seen = new Set<number>()
  for (const ch of text) {
    const codepoint = ch.codePointAt(0)
    if (codepoint === undefined || !isEmoji(codepoint) || isModifier(codepoint)) continue
    if (seen.has(codepoint)) continue
    seen.add(codepoint)
    const key = `${codepoint}:${size}`
    if (rasterized.has(key)) continue
    const rgba = rasterize(codepoint, size)
    // Se cachea también el "no dibujó": reintentar en cada tecla sería peor.
    rasterized.add(key)
    if (rgba) {
      module.setHostGlyph?.(codepoint, 1, size, size, rgba)
      console.debug(`[emoji] push U+${codepoint.toString(16).toUpperCase()} @${size}px`)
    } else {
      console.warn(`[emoji] sin píxeles para U+${codepoint.toString(16).toUpperCase()} (¿fuente?)`)
    }
  }
}

/** Empuja al motor los emoji del texto (espera a la fuente empaquetada). */
export function pushEmojiGlyphs(module: InnertaModule | null, text: string): void {
  if (!module?.setHostGlyph || !text) return
  if (!fontReady) {
    pendingModule = module
    pendingAfterFont = text
    return
  }
  pushEmojiGlyphsFor(module, text)
}

/**
 * Versión con debounce para el camino de tecleo: escanear el buffer entero en
 * cada carácter es de más; 250 ms después de la última edición alcanza.
 */
export function scheduleEmojiGlyphs(module: InnertaModule | null, text: string): void {
  pendingText = text
  if (pushTimer) return
  pushTimer = setTimeout(() => {
    pushTimer = undefined
    pushEmojiGlyphs(module, pendingText)
  }, 250)
}

/** Para tests: limpia la caché de rasterizados. */
export function _resetEmojiGlyphsForTests(): void {
  rasterized.clear()
}
