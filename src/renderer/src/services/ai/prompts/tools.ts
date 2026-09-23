/**
 * Renderizado de tools para el system prompt.
 *
 * La lista se genera desde el registry de tools (getToolDefinitions), así el
 * prompt siempre refleja las tools reales registradas — nunca se desincroniza.
 */

import { getEnabledToolDefinitions, registry } from '../tools'

type JsonSchema = Record<string, unknown>

function schemaType(schema: JsonSchema | undefined): string {
  if (!schema) return 'any'
  const t = schema.type
  if (Array.isArray(t)) return t.join(' | ')
  if (typeof t === 'string') return t
  return 'any'
}

/** Formatea un parámetro del schema: `name (type, required|optional): desc`. */
function formatParam(name: string, schema: JsonSchema | undefined, required: boolean): string {
  const type = schemaType(schema)
  const req = required ? 'required' : 'optional'
  const desc =
    typeof schema?.description === 'string' ? (schema.description as string) : ''
  return `- ${name} (${type}, ${req})${desc ? `: ${desc}` : ''}`
}

/** Renderiza la lista completa de tools habilitadas, con sus parámetros. */
export function renderToolsList(sessionId: string | null = null): string {
  const defs = getEnabledToolDefinitions(sessionId)
  if (defs.length === 0) return '(no hay tools disponibles)'

  const lines: string[] = []
  for (const def of defs) {
    const fn = def.function
    const props =
      (fn.parameters?.properties as Record<string, JsonSchema> | undefined) ?? {}
    const required = Array.isArray(fn.parameters?.required)
      ? new Set<string>(fn.parameters!.required as string[])
      : new Set<string>()
    const paramNames = Object.keys(props)

    lines.push(`- **${fn.name}** — ${fn.description}`)
    if (paramNames.length > 0) {
      lines.push('  Parameters:')
      for (const name of paramNames) {
        lines.push(`    ${formatParam(name, props[name], required.has(name))}`)
      }
    }
    // Guía propia de la tool (`prompt.ts`): cómo/cuándo usarla. Antes esto
    // estaba muerto — la descripción iba al prompt pero el `prompt` no.
    const guidance = registry.get(fn.name)?.prompt?.trim()
    if (guidance && guidance !== fn.description.trim()) {
      lines.push(`  Guidance: ${guidance}`)
    }
  }
  return lines.join('\n')
}

/** Explica el formato de tool call (OpenAI function-calling). */
export function renderToolCallFormat(): string {
  return `Tools are called with the OpenAI function-calling format:

{"function": {"name": "<tool name>", "arguments": "<JSON-encoded arguments object>"}}

Emit tool calls as part of your assistant message when a task requires reading,
creating, editing, searching or deleting files, running shell commands, or
interacting with the web. Wait for the tool result before continuing.`
}

/** Fragmento de guía de uso de tools (del system prompt base de Scrakk CLI). */
export const TOOL_CALLING_GUIDE = `- Use specialized tools instead of bash commands when possible, as this provides a better user experience.
- For file operations, prefer the dedicated file tools: read_file for reading files instead of cat/head/tail, and write_file / replace_in_file / append_file for editing instead of sed/awk.
- Reserve execute_command exclusively for actual system commands and terminal operations that require shell execution.
- NEVER use echo or other command-line tools to communicate thoughts or explanations to the user — output all communication directly in your response text.
- Read a file before editing it: replace_in_file requires the exact current text.
- Use relative paths from the workspace root when passing file paths to tools.
- When a tool call fails, read the error message carefully, fix the arguments, and retry before giving up.
- When you need several independent pieces of information, batch multiple tool calls in a single response instead of doing them one at a time.
- Use multiple_tools to run a short sequence of operations in a single call when the steps are already known.`
