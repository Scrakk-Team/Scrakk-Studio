// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * `viewsWelcome` — el contenido que la extensión declara para una vista VACÍA.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO ES UN DETALLE
 *
 * Cuando una vista de árbol no tiene nodos, VS Code no muestra el mensaje del
 * IDE: muestra el que la EXTENSIÓN declaró en `contributes.viewsWelcome`. Es
 * el caso de Comment Anchors ("Searching for anchors…" con su botón) y de
 * media docena de paneles que se explican solos.
 *
 * Aquí vive el PARSER de ese contenido, y es data pura a propósito: el mismo
 * texto se lee en el traductor (que lo mete en el manifest SEF) y en la UI
 * (que lo pinta), y ninguno de los dos tiene que saber de markdown de VS Code.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SINTAXIS QUE SOPORTAMOS (la que usan las extensiones de verdad)
 *
 *   "Sin anclas todavía.\n[Crear ancla](command:anchors.create)\n[Buscar](command:anchors.search?%5B%22x%22%5D)"
 *
 *  - Cada LÍNEA con un único link `[texto](command:id)` es un BOTÓN.
 *  - Los args van URL-encoded después de `?` y son JSON
 *    (`encodeURIComponent(JSON.stringify(args))`, tal como los emite VS Code).
 *  - El resto de las líneas es texto.
 *  - `when` (clave de contexto) no se evalúa aquí: viaja tal cual y lo resuelve
 *    la UI, que es quien conoce las claves publicadas por la extensión.
 */

export interface WelcomeTextPart {
  kind: 'text'
  text: string
}

export interface WelcomeCommandPart {
  kind: 'command'
  /** Texto del botón (lo que ve el usuario). */
  label: string
  /** Id del comando a ejecutar. */
  command: string
  /** Argumentos ya parseados (vacío si el comando no recibe nada). */
  args: unknown[]
}

export type WelcomePart = WelcomeTextPart | WelcomeCommandPart

/** `[texto](command:id)` ocupando TODA la línea. */
const COMMAND_LINE = /^\[([^\]]+)\]\(command:([^)\s]+)\)$/

/**
 * Convierte `contents` en partes pintables.
 *
 * Nunca tira: un contenido raro devuelve lo que se pudo leer (el peor caso es
 * texto plano). Un panel vacío con un error de parseo es peor que un panel
 * vacío con el texto de la extensión.
 */
export function parseWelcomeContents(contents: string): WelcomePart[] {
  const parts: WelcomePart[] = []
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0) continue

    const command = parseCommandLine(line)
    if (command) {
      parts.push(command)
      continue
    }
    // Links embebidos en una frase: se conserva el texto visible, sin la
    // sintaxis markdown, para no mostrar corchetes ni paréntesis crudos.
    parts.push({ kind: 'text', text: stripInlineLinks(line) })
  }
  return parts
}

/** Intenta leer una línea como botón de comando. `null` si no lo es. */
export function parseCommandLine(line: string): WelcomeCommandPart | null {
  const match = COMMAND_LINE.exec(line.trim())
  if (!match) return null
  const [, label, target] = match
  const [command, query] = splitQuery(target)
  if (command.length === 0) return null
  return { kind: 'command', label: label.trim(), command, args: parseArgs(query) }
}

/** Separa `id?args` en sus dos partes (el `?` sólo cuenta una vez). */
function splitQuery(target: string): [string, string] {
  const at = target.indexOf('?')
  if (at < 0) return [target, '']
  return [target.slice(0, at), target.slice(at + 1)]
}

/**
 * Args de un comando. VS Code los manda URL-encoded y como JSON array; si el
 * comando no los usa, el `?` no está. Un JSON inválido NO rompe el botón: el
 * comando se ejecuta sin args (mejor eso que un botón muerto).
 */
function parseArgs(query: string): unknown[] {
  if (query.length === 0) return []
  let decoded = query
  try {
    decoded = decodeURIComponent(query)
  } catch {
    // Query con `%` suelto: se intenta con lo que vino.
  }
  try {
    const parsed: unknown = JSON.parse(decoded)
    if (Array.isArray(parsed)) return parsed
    return [parsed]
  } catch {
    return []
  }
}

/** Saca la sintaxis de link dejando el texto visible. */
function stripInlineLinks(line: string): string {
  return line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1').trim()
}

/**
 * ¿Hay algo que pintar? Un `viewsWelcome` con sólo líneas vacías no debería
 * reemplazar el estado vacío del IDE por otro estado vacío igual de mudo.
 */
export function hasWelcomeContent(parts: WelcomePart[]): boolean {
  return parts.some((part) => part.kind === 'command' || part.text.trim().length > 0)
}
