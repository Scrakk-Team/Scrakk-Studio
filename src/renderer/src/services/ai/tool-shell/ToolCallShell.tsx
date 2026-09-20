/**
 * ToolCallShell — delega en la carpeta visual/ de cada tool.
 *
 * Rol exacto: DETECTAR si la tool tiene visual propio (meta.renderBody /
 * children) y USARLO tal cual, sin card, header, chevron ni diseño propio.
 * El texto simple (y el shimmer mientras carga) vive 100% en cada tool,
 * en su propia carpeta visual/. Aquí solo queda el fallback para las tools
 * sin visual y el estado de error.
 */

import type { JSX, ReactNode } from 'react'
import type { ToolMeta } from '../tools/types'
import type { ToolCall } from '../tools/types'
import styles from './ToolCallShell.module.css'

export type ToolCallStatusType = 'pending' | 'streaming' | 'running' | 'success' | 'error' | 'blocked'

export interface ToolCallExecution {
  toolCall: ToolCall
  status: ToolCallStatusType
  result?: string
  filePath?: string
  originalContent?: string
  modifiedContent?: string
  partialArgs?: string
}

interface ToolCallShellProps {
  execution: ToolCallExecution
  meta?: ToolMeta
  /** Contenido custom — reemplaza el renderBody de la tool. */
  children?: ReactNode
}

/**
 * Extract a display-friendly arg string from the tool's raw JSON args.
 */
function extractDisplayArg(
  headerArgKey: string | string[] | undefined,
  args: Record<string, unknown>
): string {
  if (!headerArgKey) return ''

  const keys = Array.isArray(headerArgKey) ? headerArgKey : [headerArgKey]
  for (const key of keys) {
    const val = args[key]
    if (val !== undefined && val !== null && val !== '') {
      if (Array.isArray(val)) return val.join(', ')
      return String(val)
    }
  }
  return ''
}

/**
 * Parse tool call arguments, handling partial JSON during streaming.
 */
function parseArgs(toolCall: ToolCall, partialArgs?: string): Record<string, unknown> {
  const raw = partialArgs || toolCall.function.arguments || ''
  try {
    return JSON.parse(raw)
  } catch {
    // Regex fallback for streaming partial JSON
    const result: Record<string, unknown> = {}
    const pathMatch = raw.match(/"path"\s*:\s*"([^"]+)"/)
    if (pathMatch) result.path = pathMatch[1]
    const commandMatch = raw.match(/"command"\s*:\s*"([^"]+)"/)
    if (commandMatch) result.command = commandMatch[1]
    const queryMatch = raw.match(/"query"\s*:\s*"([^"]+)"/)
    if (queryMatch) result.query = queryMatch[1]
    const urlMatch = raw.match(/"url"\s*:\s*"([^"]+)"/)
    if (urlMatch) result.url = urlMatch[1]
    return result
  }
}

export function ToolCallShell({ execution, meta, children }: ToolCallShellProps): JSX.Element {
  const { toolCall, status, result, partialArgs } = execution
  const args = parseArgs(toolCall, partialArgs)

  const label = meta?.label || toolCall.function.name
  const displayArg = extractDisplayArg(meta?.headerArgKey, args)

  // Si la tool tiene visual propio → se usa tal cual (detectar visual y delegar).
  const visual = children ?? meta?.renderBody?.(args, result, status)

  // Fallback de error (sin visual): ⚠ {label} · {arg}.
  if (status === 'error' && !visual) {
    return (
      <span className={styles.errorText}>
        ⚠ {label}
        {displayArg ? ` · ${displayArg}` : ''}
      </span>
    )
  }

  // CSS propio de la tool (vive en su carpeta visual/) + su contenido directo.
  return (
    <>
      {meta?.displayCss ? <style>{meta.displayCss}</style> : null}
      {visual ?? (
        <span>
          {label}
          {displayArg ? ` · ${displayArg}` : ''}
        </span>
      )}
    </>
  )
}
