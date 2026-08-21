/**
 * Session management for tools.
 * Tracks which session is active so tools can be filtered per-chat.
 */

import { registry } from './registry'

let activeToolSessionId: string | null = null

export function setActiveToolSessionId(sessionId: string | null): void {
  activeToolSessionId = sessionId
}

export function getActiveToolSessionId(): string | null {
  return activeToolSessionId
}

/**
 * Returns the JSON-schema tool definitions the AI is allowed to call right now.
 * Filters by toolSettings (if available) and session constraints.
 */
export function getActiveToolDefinitions(toolSettings?: {
  isEnabledForSession: (sessionId: string | null, toolName: string) => boolean
}) {
  const sessionId = activeToolSessionId

  return registry.getDefinitionsFiltered(
    new Set(
      registry.getNames().filter(name => {
        // Disabled by the user → never expose
        if (toolSettings && !toolSettings.isEnabledForSession(sessionId, name)) {
          return false
        }
        return true
      })
    )
  )
}
