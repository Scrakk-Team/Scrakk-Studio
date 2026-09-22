/**
 * SubagentOpenBridge — escucha `subagent:open` y abre el chat del subagente.
 *
 * Desacopla la card de la tool `task` (capa services) del feature de chat:
 * la card solo dispara el evento global; acá se abre el modal.
 */

import { useEffect } from 'react'
import { openSubagentChat } from './spawn'

interface OpenDetail {
  sessionId?: string
  title?: string
}

export function SubagentOpenBridge(): null {
  useEffect(() => {
    const onOpen = (event: Event): void => {
      const detail = (event as CustomEvent<OpenDetail>).detail
      if (!detail?.sessionId) return
      openSubagentChat({ sessionId: detail.sessionId, title: detail.title })
    }
    window.addEventListener('subagent:open', onOpen)
    return () => window.removeEventListener('subagent:open', onOpen)
  }, [])
  return null
}
