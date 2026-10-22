// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Fuentes de la TERMINAL resueltas desde el sistema.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ
 *
 * El motor resolvía los glifos que la primaria no tiene (box-drawing `─`,
 * bloques, braille `⠋`, powerline, flechas) con una lista FIJA de fuentes
 * empaquetadas. Eso hace que el mismo carácter se vea distinto que en la
 * terminal del usuario, que los resuelve con **fontconfig**.
 *
 * Acá se resuelve lo mismo que resolvería esa terminal: por cada code point que
 * una terminal usa se le pregunta a fontconfig QUÉ fuente elegiría, y se arma la
 * cadena con esas fuentes, ordenadas por cuántos code points les tocan (el motor
 * resuelve por orden, así coincide con fontconfig).
 *
 * Este archivo NO importa Electron a propósito: así se puede testear (ver
 * `tests/terminal-font-stack.test.ts`) y no depende de la ventana.
 */

import * as fs from 'fs'
import * as path from 'path'
import { execSync, execFileSync } from 'child_process'
import type { TerminalFontFile } from '@shared/terminal'

/**
 * Topes de la cadena (red de seguridad, no presupuesto real).
 *
 * El peso no importa: se leen al abrir y se sueltan al cerrar.
 */
// El peso NO es la restricción: las fuentes se leen del sistema al abrir y se
// sueltan al cerrar (no se guardan en disco ni en la app). Los topes quedan
// solo como red de seguridad contra una fuente absurda, altos a propósito para
// poder usar LAS MISMAS que la terminal del usuario (p. ej. Noto Sans CJK, 19 MB,
// que es lo que fontconfig elige para `ⓘ` U+24D8).
export const FONT_STACK_MAX_FONTS = 10
export const FONT_STACK_MAX_FONT_BYTES = 32 * 1024 * 1024
export const FONT_STACK_MAX_TOTAL_BYTES = 64 * 1024 * 1024

/**
 * Code points que una TERMINAL necesita y que la monoespaciada casi nunca trae.
 *
 * Uno por bloque alcanza: lo que importa es QUÉ fuente elige fontconfig para
 * cada caso. Si se agrega un bloque nuevo, se agrega un code point acá.
 */
export const TERMINAL_SAMPLE_CODEPOINTS: readonly number[] = [
  0x2500, // box drawing: ─
  0x2502, // box drawing: │
  0x2588, // block elements: █
  0x2591, // block elements: ░
  0x2800, // braille: ⠀
  0x21b5, // flechas: ↵
  0x2192, // flechas: →
  0x25cf, // formas geométricas: ●
  0x2713, // dingbats: ✓
  0x2261, // matemática: ≡
  0xe0b0, // powerline (área privada): 
  // Símbolos que SUELTAN los CLIs (docks, spinners, botones, flechas): si no se
  // muestrean, su fuente no entra en la cadena y el carácter queda INVISIBLE
  // (caso `ⓘ` U+24D8 del dock de botones de un CLI: fontconfig lo resuelve a
  // Noto Sans CJK de 19 MB y sin el muestreo no entraba NADA que lo cubriera).
  0x24d8, // ⓘ
  0x25c7, // ◇
  0x25be, // ▾
  0x276f, // ❯
  0x2190, // ←
  0x2193, // ↓
  0x21d2, // ⇒
  0x2197, // ↗
  0x2717, // ✗
  0x254c, // ╌
  // Emoji NO se muestrea acá: tiene su propia fuente (ver `resolveEmojiFont`).
  // Si se muestreaba, fontconfig contestaba `Unifont` (monocromo) y nos metía
  // una fuente enorme en la cadena para glifos que ahora resuelve el emoji.
]

/**
 * Fuente y tamaño REALES de la terminal por defecto del sistema.
 *
 * Es lo que hace que el grid tenga las MISMAS métricas que la terminal del
 * usuario: no alcanza con la misma familia, el TAMAÑO (y por lo tanto el ancho
 * de celda y, sobre todo, el alto) tiene que coincidir. Con `theme.fontSize` del
 * editor, la terminal salía "más grande" y los TUIs no cuadraban.
 */
export type SystemTerminalFont = {
  /** Familia de fontconfig (sin el estilo: "JetBrains Mono NL", no "… Italic"). */
  family: string
  /** Tamaño en píxeles (pt → px a 96 dpi, escalado por el text-scaling). */
  px: number
}

/** Corre `gsettings get …` y devuelve el valor sin las comillas. */
function gsettingsGet(schema: string, key?: string): string {
  try {
    const arg = key ? `${schema} ${key}` : schema
    return execSync(`gsettings get ${arg}`, { encoding: 'utf-8', timeout: 3000 })
      .trim()
      .replace(/^'(.*)'$/s, '$1')
  } catch {
    return ''
  }
}

/** saque los adjetivos de estilo que GTK mete en el nombre ("… Italic 10"). */
function familyOfGtkName(name: string): string {
  return name
    .replace(
      /\b(ultra|extra|semi)?-?\s*(light|thin|bold|black|italic|oblique|medium|regular|book|demibold)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Resuelve la fuente de la terminal del sistema (o null si no se puede saber).
 *
 * Linux: GNOME/GTK (`monospace-font-name`) o el perfil de GNOME Terminal si NO
 * usa la del sistema. Windows: la consola (registro `HKCU\Console`).
 */
/**
 * El `FontSize` de la consola (`HKCU\Console`) es el **alto de celda en píxeles**
 * (~1.23× el em) y, encima, en px de DISPOSITIVO. El motor, en cambio, espera un
 * **em en px LÓGICOS** (el canvas de la terminal va en px lógicos). Mandarlo crudo
 * (16, o más en HiDPI) donde Linux manda ~13 era la "terminal gigante" en Windows.
 * Se normaliza device→lógico (`/scaleFactor`) y celda→em (13/16), y se acota a un
 * rango legible. NO toca la grilla: el motor re-deriva charWidth/lineHeight del em.
 */
export function windowsConsoleEmPx(cellHeight: number, scaleFactor: number): number {
  const scale = scaleFactor > 0 ? scaleFactor : 1
  const em = Math.round((cellHeight / scale) * (13 / 16))
  return Math.min(22, Math.max(10, em))
}

/**
 * Lee un valor del registro de Windows.
 *
 * **Sin shell**: `execSync` pasa la línea por `cmd.exe`, y ahí la clave
 * `HKCU\\Console` llegaba a `reg` con la barra de más → *"ERROR: Invalid key
 * name. Type "REG QUERY /?" for usage."* — que además se imprimía en la
 * consola, porque `execSync` hereda el stderr. Con `execFileSync` no hay shell
 * que toque la clave, y el stderr se descarta: si la clave no existe, `reg`
 * escribe el error y sale con 1.
 */
function regQuery(key: string, value: string): string {
  try {
    return execFileSync('reg', ['query', key, '/v', value], {
      encoding: 'utf-8',
      timeout: 3000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    })
  } catch {
    // La clave o el valor no existen: no hay fuente del sistema que leer.
    return ''
  }
}

export function resolveSystemTerminalFont(scaleFactor = 1): SystemTerminalFont | null {
  if (process.platform === 'win32') {
    try {
      let face = ''
      let cellHeight = 16
      const out = regQuery('HKCU\\Console', 'FaceName')
      const faceMatch = /FaceName\s+REG_SZ\s+(.+)/.exec(out)
      if (faceMatch) face = faceMatch[1].trim()
      // `__DefaultTTFont__` NO es una familia: es el centinela de conhost para
      // "la fuente por defecto". Como nombre de familia no existe.
      if (!face || face === '__DefaultTTFont__') face = ''
      const sizeOut = regQuery('HKCU\\Console', 'FontSize')
      // DWORD 0x00HH00WW: el alto en píxeles va en la palabra alta.
      const hex = /FontSize\s+REG_DWORD\s+0x([0-9a-fA-F]+)/.exec(sizeOut)
      if (hex) {
        const h = (parseInt(hex[1], 16) >> 16) & 0xffff
        if (h >= 6 && h <= 72) cellHeight = h
      }
      return { family: face || 'Consolas', px: windowsConsoleEmPx(cellHeight, scaleFactor) }
    } catch {
      return { family: 'Consolas', px: windowsConsoleEmPx(16, scaleFactor) } // default de conhost
    }
  }

  try {
    // Perfil de GNOME Terminal: si NO usa la del sistema, manda su `font`.
    let name = ''
    const profile = gsettingsGet('org.gnome.Terminal.ProfilesList', 'default')
    if (profile) {
      const base = `org.gnome.Terminal.Legacy.Profile:/org/gnome/terminal/legacy/profiles:/:${profile}/`
      if (gsettingsGet(base, 'use-system-font') === 'false') name = gsettingsGet(base, 'font')
    }
    if (!name) name = gsettingsGet('org.gnome.desktop.interface', 'monospace-font-name')
    if (!name) return null

    // "Familia Estilo… N" — el TAMAÑO va al final (en puntos).
    const match = /^(.*?)\s+(\d+(?:[.,]\d+)?)$/.exec(name.trim())
    if (!match) return null
    const family = familyOfGtkName(match[1]) || 'monospace'
    const pt = parseFloat(match[2].replace(',', '.'))
    const scaling = parseFloat(gsettingsGet('org.gnome.desktop.interface', 'text-scaling-factor'))
    // GTK mide en puntos y asume 96 dpi: 10pt = 13.33px.
    const px = Math.round(pt * (96 / 72) * (Number.isFinite(scaling) ? scaling : 1))
    if (!Number.isFinite(px) || px < 6 || px > 72) return null
    return { family, px }
  } catch {
    return null
  }
}

/** Ejecuta `fc-match` (vacío si no hay fontconfig o falla). */
function fcMatch(args: string): string {
  try {
    return execSync(`fc-match ${args}`, { encoding: 'utf-8', timeout: 4000 }).trim()
  } catch {
    return ''
  }
}

/**
 * Familia a usar como PATRÓN de fontconfig, saneada.
 *
 * El nombre va entre comillas en el comando, así que una comilla adentro
 * rompería el shell — y el nombre viene de un ajuste del usuario.
 */
function safeFamily(family?: string): string {
  const clean = (family ?? '').replace(/['"`$\n\\]/g, '').trim()
  return clean.length > 0 ? clean : 'monospace'
}

/**
 * Familias monoespaciadas instaladas, para el selector de Ajustes.
 *
 * Linux: `fc-list :spacing=mono` (lo que el sistema considera monoespaciado).
 * Windows: la lista corta de las que trae Windows.
 */
export function listMonoFamilies(): string[] {
  if (process.platform === 'win32') {
    return ['Consolas', 'Cascadia Mono', 'Courier New', 'Lucida Console']
  }
  try {
    // El formato va entre comillas: sin ellas el shell se come el `\n` y todo
    // sale en UNA línea pegoteada.
    const out = execSync("fc-list :spacing=mono --format='%{family[0]}\\n'", {
      encoding: 'utf-8',
      timeout: 4000
    })
    const set = new Set<string>()
    for (const line of out.split('\n')) {
      const name = line.trim()
      if (name) set.add(name)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

/**
 * Fuente que fontconfig usaría para ESE code point (la verdad del sistema).
 *
 * Es la misma pregunta que responde una terminal de verdad cuando se topa con
 * un carácter que su fuente primaria no tiene.
 */
export function systemFontForCodepoint(
  codepoint: number,
  family = 'monospace',
  // Presupuesto: el de la CADENA por defecto, pero el CJK tiene el suyo (32 MB)
  // y si no se pasa acá se filtraría a 6 MB y elegiría una CJK peor.
  maxBytes = FONT_STACK_MAX_FONT_BYTES
): string | null {
  if (process.platform === 'win32') return null
  const charset = codepoint.toString(16)
  // Entra en el presupuesto de la cadena y es una fuente de VERDAD: fontconfig
  // también lista stubs de 43 bytes (`fonts-japanese-gothic.ttf`) que no sirven.
  const fits = (file: string): boolean => {
    try {
      if (!/\.(ttf|otf|ttc)$/i.test(file)) return false
      const size = fs.statSync(file).size
      return size > 64 * 1024 && size <= maxBytes
    } catch {
      return false
    }
  }
  const first = fcMatch(`--format=%{file} ':charset=${charset}' '${safeFamily(family)}'`)
  if (first && fs.existsSync(first) && fits(first)) return first
  // La primera no entra: probar la lista ORDENADA de fontconfig y quedarse con la
  // primera que entre. Sin esto un `ⓘ` (U+24D8) quedaba SIN glifo, porque
  // fontconfig lo resuelve a Noto Sans CJK (19 MB > tope) y la fuente se
  // descartaba; con esto cae a `Noto Sans Symbols` (0.25 MB), que es lo que
  // termina usando la terminal del usuario.
  //
  // OJO: `fc-match -s` devuelve TODAS las fuentes ordenadas por qué tan bien
  // matchean — las que NO cubren el code point vienen al final. Por eso hay que
  // cruzarla con `fc-list ':charset=CP'` (las que lo cubren DE VERDAD); si no,
  // el walk podía elegir una que no lo tiene y el glifo quedaba vacío.
  let covering = new Set<string>()
  try {
    const out = execSync(`fc-list --format='%{file}\\n' ':charset=${charset}'`, {
      encoding: 'utf-8',
      timeout: 4000
    })
    covering = new Set(
      out
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    )
  } catch {
    // Sin fc-list: se sigue con la lista ordenada (mejor que nada).
  }
  for (const line of fcMatch(`-s --format='%{file}\\n' ':charset=${charset}'`).split('\n')) {
    const file = line.trim()
    if (file && covering.has(file) && fs.existsSync(file) && fits(file)) return file
  }
  return null
}

/** La monoespaciada primaria del sistema. */
export function systemPrimaryFont(family = 'monospace'): string | null {
  if (process.platform === 'win32') return null
  const out = fcMatch(`--format=%{file} '${safeFamily(family)}'`)
  return out && fs.existsSync(out) ? out : null
}

/** Las candidatas ORDENADAS de fontconfig (`fc-match -s`), sin repetir. */
export function systemFallbackList(family = 'monospace'): string[] {
  if (process.platform === 'win32') return []
  const out = fcMatch(`-s --format='%{file}\\n' '${safeFamily(family)}'`)
  const list: string[] = []
  for (const line of out.split('\n')) {
    const file = line.trim()
    if (file && fs.existsSync(file) && !list.includes(file)) list.push(file)
  }
  return list
}

/**
 * La lista de Windows: no hay fontconfig, así que van las fuentes que Windows
 * usa para las consolas — mono primero y después las de símbolos, emoji y CJK.
 */
export function windowsFontCandidates(): string[] {
  const dir = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts')
  return [
    'consola.ttf', // Consolas: la mono por defecto de las consolas
    'lucon.ttf', // Lucida Console
    'seguisym.ttf', // Segoe UI Symbol: box-drawing, flechas, dingbats (monocromo)
    // Segoe UI Emoji (seguiemj.ttf) NO va acá: es la fuente de EMOJI a color,
    // con su propia ranura (ver `resolveEmojiFont`), y sólo se usa para los code
    // points de presentación emoji.
    'arial.ttf',
    'msgothic.ttc', // CJK (japonés)
    'malgun.ttf', // CJK (coreano)
    'msyh.ttc', // CJK (simplificado)
    'simsun.ttc'
  ]
    .map((name) => path.join(dir, name))
    .filter((file) => fs.existsSync(file))
}

/**
 * Rutas de las fuentes de la terminal, EN ORDEN (primaria primero).
 *
 * Linux: la primaria es la mono del sistema y los REEMPLAZOS son las fuentes que
 * fontconfig elegiría para los code points de `TERMINAL_SAMPLE_CODEPOINTS`,
 * ordenadas por CUÁNTOS le tocan. El motor resuelve por orden, así que eso lo
 * hace coincidir con el sistema en vez de con las fuentes empaquetadas.
 *
 * Se resuelve EN CALIENTE (nada se guarda en disco).
 */
export function resolveFontCandidates(family = 'monospace'): string[] {
  if (process.platform === 'win32') return windowsFontCandidates()

  const primary = systemPrimaryFont(family)
  const assigned: string[] = []
  const counts = new Map<string, number>()
  // Sin fuente de emoji a COLOR, el plano astral sólo tiene respaldo monocromo
  // (Unifont): se muestrea para que esos emoji no queden en blanco. Con la de
  // color, el motor los resuelve por su ranura y no ensuciamos la cadena.
  const samples = findColorEmojiFontFile()
    ? TERMINAL_SAMPLE_CODEPOINTS
    : [...TERMINAL_SAMPLE_CODEPOINTS, 0x1f600]
  for (const codepoint of samples) {
    const file = systemFontForCodepoint(codepoint, family)
    if (!file) continue
    counts.set(file, (counts.get(file) ?? 0) + 1)
    if (!assigned.includes(file)) assigned.push(file)
  }

  // Más code points asignados = más relevante = más arriba. Empate: el orden en
  // que fontconfig los fue devolviendo (estable).
  const ordered = [...assigned].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))

  const out: string[] = []
  const push = (file: string | null): void => {
    if (file && !out.includes(file)) out.push(file)
  }
  push(primary)
  for (const file of ordered) push(file)
  // Red de seguridad: si las consultas por code point no dieron nada (fontconfig
  // raro), queda la lista ordenada completa.
  for (const file of systemFallbackList(family)) push(file)
  return out
}

/**
 * Tope de la fuente CJK.
 *
 * Se carga SOLA, aparte de la cadena: no compite con `FONT_STACK_MAX_*` porque
 * sólo entra si el buffer tiene CJK. Es más alto porque las CJK reales pesan
 * bastante (Noto Sans CJK ≈ 19 MB) y sin margen no entraría ninguna.
 */
export const FONT_CJK_MAX_BYTES = 32 * 1024 * 1024

/** Un code point por script CJK: japonés, chino y coreano. */
export const CJK_SAMPLE_CODEPOINTS: readonly number[] = [
  0x3042, // hiragana: あ
  0x4e2d, // han: 中
  0xac00 // hangul: 가
]

/**
 * Fuente CJK del sistema (japonés / chino / coreano).
 *
 * Se pide aparte de la cadena porque pesa decenas de MB y cada terminal carga su
 * propia copia: traerla siempre sería regalar RAM. Sólo se llama cuando en el
 * buffer apareció un carácter CJK, y una vez por sesión.
 */
export function resolveCjkFont(family = 'monospace'): TerminalFontFile | null {
  const candidates: string[] = []
  if (process.platform === 'win32') {
    const dir = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts')
    for (const name of ['msgothic.ttc', 'malgun.ttf', 'msyh.ttc', 'simsun.ttc', 'yugothic.ttf']) {
      const file = path.join(dir, name)
      if (fs.existsSync(file)) candidates.push(file)
    }
  } else {
    for (const codepoint of CJK_SAMPLE_CODEPOINTS) {
      // Con el tope del CJK (32 MB), no el de la cadena: el Noto CJK pesa 19 MB.
      const file = systemFontForCodepoint(codepoint, family, FONT_CJK_MAX_BYTES)
      if (file && !candidates.includes(file)) candidates.push(file)
    }
  }

  for (const file of candidates) {
    try {
      const stat = fs.statSync(file)
      if (stat.size > FONT_CJK_MAX_BYTES) continue
      const data = fs.readFileSync(file)
      return {
        family: path.basename(file).replace(/\.[^.]+$/, ''),
        file,
        data: new Uint8Array(data)
      }
    } catch {
      // Ilegible: se prueba la siguiente.
    }
  }
  return null
}

/**
 * Tope de la fuente de emoji. Va aparte porque las de color pesan bastante
 * (Noto Color Emoji ≈ 10 MB) y no entran en el tope de la cadena.
 */
export const FONT_EMOJI_MAX_BYTES = 32 * 1024 * 1024

/**
 * Familias de emoji a COLOR, en orden — la que trae cada SO por defecto.
 *
 * Se busca por FAMILIA y no por `:charset=`: fontconfig contesta con la primera
 * que CUBRA el code point, y eso devuelve `Unifont` (monocromo) antes que la de
 * color. Es el problema clásico de fontconfig con los emoji; kitty/wezterm lo
 * esquivan buscando la familia del emoji directamente.
 */
const COLOR_EMOJI_FAMILIES = [
  'Noto Color Emoji', // Linux
  'Apple Color Emoji', // macOS
  'Segoe UI Emoji', // Windows
  'Twemoji Mozilla',
  'EmojiOne Color',
  'JoyPixels'
]

/**
 * Ruta de la fuente de EMOJI a COLOR del sistema (o null), sin leer el archivo.
 *
 * Se usa para dos cosas: cargarla bajo demanda y —en `resolveFontCandidates`—
 * saber si hace falta un respaldo monocromo para el plano astral.
 */
export function findColorEmojiFontFile(): string | null {
  if (process.platform === 'win32') {
    const dir = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts')
    const file = path.join(dir, 'seguiemj.ttf') // Segoe UI Emoji
    return fs.existsSync(file) ? file : null
  }

  for (const family of COLOR_EMOJI_FAMILIES) {
    // `fc-match` SIEMPRE devuelve algo (cae a la default si no existe), así que
    // se pide también el nombre y se verifica que sea ESA familia. El formato va
    // entre comillas: si no, el `|` lo toma el shell como caño.
    const out = fcMatch(`--format='%{file}|%{family[0]}' '${safeFamily(family)}'`)
    const sep = out.lastIndexOf('|')
    if (sep < 0) continue
    const file = out.slice(0, sep).trim()
    const matched = out.slice(sep + 1).trim()
    if (!file || matched.toLowerCase() !== family.toLowerCase()) continue
    try {
      if (!fs.existsSync(file)) continue
      if (fs.statSync(file).size > FONT_EMOJI_MAX_BYTES) continue
      return file
    } catch {
      // Ilegible: se prueba la siguiente familia.
    }
  }
  return null
}

/**
 * Fuente de EMOJI a COLOR del sistema (o null).
 *
 * NO entra en la cadena: el motor la usa como cara propia y sólo para los code
 * points con presentación emoji (`⚡ ✅ ✨ 😀`). Los de presentación texto
 * (`✓ ❤ ☀ ⚠`), que es lo que sueltan los CLIs, siguen monocromos por la cadena.
 */
export function resolveEmojiFont(): TerminalFontFile | null {
  const file = findColorEmojiFontFile()
  if (!file) return null
  try {
    return {
      family: path.basename(file).replace(/\.[^.]+$/, ''),
      file,
      data: new Uint8Array(fs.readFileSync(file))
    }
  } catch {
    return null
  }
}

/** Lee los archivos de la cadena (con sus topes) y les pone un nombre legible. */
export function readFontStack(candidates: readonly string[]): TerminalFontFile[] | null {
  const out: TerminalFontFile[] = []
  let total = 0
  for (const file of candidates) {
    if (out.length >= FONT_STACK_MAX_FONTS) break
    try {
      const stat = fs.statSync(file)
      if (stat.size > FONT_STACK_MAX_FONT_BYTES) continue
      if (total + stat.size > FONT_STACK_MAX_TOTAL_BYTES) continue
      const data = fs.readFileSync(file)
      total += data.byteLength
      out.push({
        family: path.basename(file).replace(/\.[^.]+$/, ''),
        file,
        data: new Uint8Array(data)
      })
    } catch {
      // Archivo ilegible: se saltea en vez de tirar abajo la cadena.
    }
  }
  return out.length > 0 ? out : null
}
