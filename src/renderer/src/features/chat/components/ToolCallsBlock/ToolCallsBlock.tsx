/**
 * ToolCallsBlock — renders a list of tool calls from an assistant message.
 *
 * Resuelve el meta de cada tool desde el registry (label, íconos, si es
 * expandible, renderBody custom, modo plain) — la UI usa la configuración
 * real de cada tool, no defaults.
 */

import type { JSX } from 'react'
import { memo } from 'react'
import { ToolCallShell, ToolCallIcon, type ToolCallExecution } from '@services/ai/tool-shell'
import type { ToolCallInfo, ToolResultInfo, ToolCallStatusType } from '@services/chat/types'
import { registry } from '@services/ai/tools'
import styles from './ToolCallsBlock.module.css'

interface ToolCallsBlockProps {
  toolCalls: ToolCallInfo[]
  toolResults?: Record<string, ToolResultInfo>
  /** Overall status — 'running' while executing, 'success'/'error' after. */
  status?: ToolCallStatusType
}

export const ToolCallsBlock = memo(function ToolCallsBlock({
  toolCalls,
  toolResults,
  status = 'running'
}: ToolCallsBlockProps): JSX.Element {
  return (
    <div className={styles.block}>
      {toolCalls.map((tc) => {
        const resultInfo = toolResults?.[tc.id]
        const callStatus: ToolCallStatusType = resultInfo
          ? resultInfo.success ? 'success' : 'error'
          : status

        // Config real de la tool: label, expandible, renderBody, plain…
        const meta = registry.get(tc.function.name)?.meta

        const execution: ToolCallExecution = {
          toolCall: tc,
          status: callStatus,
          result: resultInfo?.content,
          filePath: resultInfo?.filePath,
          originalContent: resultInfo?.originalContent,
          modifiedContent: resultInfo?.modifiedContent,
        }

        return (
          <div key={tc.id} className={styles.toolRow}>
            <span className={styles.toolIconBox}>
              <ToolCallIcon
                toolName={tc.function.name}
                icon={meta?.icon}
                size={13}
              />
            </span>
            <div className={styles.toolVisual}>
              <ToolCallShell
                execution={execution}
                meta={meta}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
})
