/**
 * `Hover.contents` → texto markdown para el tooltip.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ HACE FALTA NORMALIZAR
 *
 * El protocolo LSP y el API de VS Code admiten VARIAS formas para el contenido
 * de un hover, y las dos llegan a este punto:
 *
 *   'Hola'                          (string)
 *   { value: 'Hola' }               (MarkupContent / MarkdownString)
 *   { language: 'ts', value: '…' }  (MarkedString: un bloque de código)
 *   [ …cualquiera de las de arriba ]  (array: es como el API de VS Code acepta
 *                                     varias partes, y los servers lo mandan)
 *
 * La versión anterior sólo miraba string y `.value`: un hover en ARRAY (muy
 * común) se pintaba VACÍO, que se lee como "el server no sabe nada de este
 * símbolo" cuando en realidad había dicho algo. Acá se aplanan todas a UN
 * documento, con los bloques de código armados y separados por `---` (que es
 * como el IDE ya separa dos hovers de servers distintos).
 */

/** Marcado mínimo que se le da a un bloque de código de un `MarkedString`. */
export function markedStringToText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  const candidate = value as { value?: unknown; language?: unknown }
  const text = typeof candidate.value === 'string' ? candidate.value : ''
  if (typeof candidate.language === 'string' && candidate.language.length > 0) {
    return `\`\`\`${candidate.language}\n${text}\n\`\`\``
  }
  return text
}

/** Texto del hover, con todas las formas aplanadas. Vacío si no hay nada. */
export function hoverContentsToText(contents: unknown): string {
  const entries = Array.isArray(contents) ? contents : [contents]
  const parts: string[] = []
  for (const entry of entries) {
    const text = markedStringToText(entry)
    if (text.length > 0) parts.push(text)
  }
  return parts.join('\n\n')
}
