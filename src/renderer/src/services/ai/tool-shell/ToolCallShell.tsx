/**
 * ToolCallShell — base shell for tool call cards.
 *
 * Provides:
 *   - Header: icon + label + arg preview + status
 *   - Expandable body (if meta.expandable)
 *   - Custom body via meta.renderBody, or default details view
 *   - CSS injection from meta.displayCss
 *
 * Each tool's visual/ provides the custom content; this shell wraps it.
 */

import { useState, type JSX, type ReactNode } from 'react'
import { ToolCallIcon } from './ToolCallIcon'
import { ToolCallStatus } from './ToolCallStatus'
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
  /** Whether to default-expand the details */
  defaultExpanded?: boolean
  /** Optional custom body rendered inside the shell */
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

export function ToolCallShell({
  execution,
  meta,
  defaultExpanded = false,
  children
}: ToolCallShellProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const { toolCall, status, result, partialArgs } = execution
  const args = parseArgs(toolCall, partialArgs)

  const label = meta?.label || toolCall.function.name
  const icon = meta?.icon
  const displayArg = extractDisplayArg(meta?.headerArgKey, args)
  const expandable = meta?.expandable ?? true
  const isLoading = status === 'pending' || status === 'streaming' || status === 'running'

  // Split path into directory + filename for display
  const pathParts = displayArg.split(/[\\/]/)
  const fileName = pathParts.pop() || displayArg
  const dirPath = pathParts.join('/')

  // Modo "plain": sin fondo, una sola línea de texto (ej. "Leí {path}").
  if (meta?.plain) {
    return (
      <div className={styles.plain} title={displayArg || undefined}>
        {meta.plainText ? <span className={styles.plainPrefix}>{meta.plainText}</span> : null}
        <span className={styles.plainArg}>{displayArg || label}</span>
      </div>
    )
  }

  return (
    <div className={`${styles.card} ${styles[status] || ''}`}>
      {/* Inject tool-specific CSS if provided */}
      {meta?.displayCss && <style>{meta.displayCss}</style>}

      {/* Header */}
      <div
        className={`${styles.header} ${expandable ? styles.expandable : ''}`}
        onClick={() => expandable && setIsExpanded(!isExpanded)}
      >
        <div className={styles.icon}>
          <ToolCallIcon toolName={toolCall.function.name} icon={icon} />
        </div>

        <div className={styles.info}>
          <span className={styles.label}>{label}</span>
          {(displayArg || isLoading) && (
            <span className={styles.argRow}>
              <span className={styles.arg}>
                {dirPath && <span className={styles.argPath}>{dirPath}/</span>}
                <span className={styles.argFilename}>{fileName}</span>
              </span>
            </span>
          )}
        </div>

        <ToolCallStatus status={status} errorMessage={result} />

        {expandable && (
          <svg
            className={`${styles.chevron} ${isExpanded ? styles.chevronExpanded : ''}`}
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </div>

      {/* Body */}
      {isExpanded && (
        <div className={styles.body}>
          {children || (
            <div className={styles.details}>
              {result && (
                <pre className={styles.resultContent}>{result}</pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
