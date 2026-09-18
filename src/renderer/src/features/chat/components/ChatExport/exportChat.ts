/**
 * Exportación de chats a texto — lógica pura (sin DOM, testeable).
 *
 * Formato: bloques `Usuario:` / `Asistente:` separados por `---`, y las
 * herramientas como `[Herramienta \`nombre\`: arg]` + resultado. El toggle
 * "incluir herramientas" las quita del texto por completo.
 */

import type { ChatSession } from '../../state/ChatSessionsContext'

export type ChatExportFormat = 'txt' | 'md'

export interface ChatExportOptions {
  /** Incluir bloques de herramientas. Default true. */
  includeTools: boolean
}

/** Límite por resultado de tool (evita dumps de MBs en el archivo). */
const MAX_TOOL_RESULT_CHARS = 3000

const SEPARATOR = '---'

/** Primera arg string legible (path/command/query/url/...) para el header. */
function displayArg(args: Record<string, unknown>): string {
  for (const key of ['path', 'command', 'query', 'url', 'file', 'pattern', 'prompt']) {
    const value = args[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return ''
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // Args parciales o texto plano: sin header de args.
  }
  return {}
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n[…truncado: ${text.length - max} caracteres más]`
}

function renderToolCall(
  name: string,
  argsRaw: string,
  result: string | undefined
): string[] {
  const args = parseArgs(argsRaw)
  const shown = displayArg(args)
  const lines = [`[Herramienta \`${name}\`${shown ? ` ${shown}` : ''}]`]
  if (result !== undefined && result.length > 0) {
    lines.push(truncate(result, MAX_TOOL_RESULT_CHARS))
  }
  return lines
}

/** Cuerpo del chat como texto plano (vale para .txt y .md). */
export function buildChatExport(
  session: Pick<ChatSession, 'messages'>,
  options: ChatExportOptions
): string {
  const blocks: string[] = []
  for (const message of session.messages) {
    if (message.role === 'user') {
      blocks.push(`Usuario:\n${message.content}`)
    } else {
      const parts: string[] = []
      if (message.content.length > 0) {
        parts.push(`Asistente:\n${message.content}`)
      }
      if (options.includeTools && message.tool_calls) {
        for (const call of message.tool_calls) {
          const result = message.tool_results?.[call.id]?.content
          parts.push(...renderToolCall(call.function.name, call.function.arguments, result))
        }
      }
      // Mensaje de sistema/vacío sin tools: se omite (no aporta nada).
      if (parts.length === 0) continue
      blocks.push(parts.join('\n\n'))
    }
  }
  return blocks.join(`\n\n${SEPARATOR}\n\n`)
}

/** Nombre de archivo seguro desde el título: minúsculas, sin raros. */
export function exportFileName(title: string, format: Exclude<ChatExportFormat, 'copy'>): string {
  const slug =
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'chat'
  return `${slug}.${format}`
}

/** Descarga el texto como archivo (Blob + anchor temporal). */
export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** Copia el texto al portapapeles. */
export async function copyChatToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}
