// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { createLlmChatService, type ChatMessage, type ChatService, type ChatInsertPayload } from '@services/chat'
import { isSlashInput, slashCommands } from '@services/slash-commands'
import { agentRegistry, subagentSessions } from '@services/ai/agents'
import { spawnSubagentChat } from '@features/chat/agents'
import type { ToolCallInfo, ToolResultInfo } from '@services/chat/types'
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useProviders } from '@features/providers'
import { useChats, ModeGlow, ChatModeBar } from '@features/chat'
import { HeaderActionButton, usePanelTitleOptional } from '@features/layout'
import { ChatInput } from '@features/chat/components/ChatInput/ChatInput'
import { EffortSparks } from '@features/chat/components/EffortSparks/EffortSparks'
import { getAvailableVariants } from '@features/chat/commands/variants/logic'
import { MessageList } from '@features/chat/components/MessageList/MessageList'
import { TimeGreeting } from '@features/chat/components/TimeGreeting/TimeGreeting'
import scrakkLogoUrl from '../../../../../public/logo/scrakk-studio.svg'
import { HistoryPanel } from '../HistoryPanel/HistoryPanel'
import {
  isHistoryViewOpen,
  setHistoryViewOpen,
  subscribeToHistoryView
} from '../HistoryPanel/viewState'
import { SkillsPanel } from '../SkillsPanel/SkillsPanel'
import { isSkillsViewOpen, setSkillsViewOpen, subscribeToSkillsView } from '../SkillsPanel/viewState'
import { ComposerFooter } from './ComposerFooter'
import styles from './ChatPanel.module.css'

/**
 * Panel de chat: usa las sesiones reales del ChatsProvider (el historial
 * refleja lo que pasa aquí) y delega el "backend" al módulo services. El LLM
 * sale por IPC al proceso main (sin CORS) usando el proveedor activo de
 * ProvidersProvider.
 *
 * Sin mensajes → el input va centrado arriba. Con mensajes → input abajo
 * y la lista mantiene la posición del usuario (scroll inteligente).
 *
 * Vive dentro del sistema de layouts: lo monta el PanelHost con su propio
 * ErrorBoundary, así un error de este panel no tumba el resto de la app.
 */
export function ChatPanel(): JSX.Element {
  const [service] = useState<ChatService>(() => createLlmChatService())
  const {
    activeSession,
    createSession,
    appendMessage,
    updateMessage,
    removeMessagesAfter
  } = useChats()
  const { activeProvider, getApiKey, getModel, getThinkingMode, getVariant } = useProviders()
  const activeVariant = activeProvider ? getVariant(activeProvider.id) : ''
  // Esfuerzo en el paso máximo: el input enciende el wash + las chispas.
  const effortSteps = getAvailableVariants().options
  const effortMaxed =
    effortSteps.length > 1 && activeVariant === effortSteps[effortSteps.length - 1]
  const [isBusy, setIsBusy] = useState(false)
  // Controller del stream en curso: el botón "Detener" lo aborta. Mientras
  // genera, el input queda escribible (no se deshabilita).
  const abortRef = useRef<AbortController | null>(null)

  // Mientras hay un subagente spawneado abierto, el input principal se bloquea
  // (estás "dentro" del subagente).
  const [subagentViewOpen, setSubagentViewOpen] = useState(() => subagentSessions.isViewOpen())
  useEffect(
    () => subagentSessions.subscribe(() => setSubagentViewOpen(subagentSessions.isViewOpen())),
    []
  )

  const messages = activeSession?.messages ?? []
  const sessionId = activeSession?.id

  // Header: "+" de nuevo chat e historial. El historial YA NO es un panel
  // aparte: es una vista que se abre adentro de este panel (columna a la
  // izquierda), así que el botón sólo alterna el flag del store. Los dos
  // botones son arrastrables (HeaderActionButton): el usuario decide el orden.
  const panelHeader = usePanelTitleOptional()
  const [showHistory, setShowHistory] = useState(() => isHistoryViewOpen())
  useEffect(() => subscribeToHistoryView(() => setShowHistory(isHistoryViewOpen())), [])
  // Vista de skills: misma mecánica que el historial (reemplaza el contenido).
  const [showSkills, setShowSkills] = useState(() => isSkillsViewOpen())
  useEffect(() => subscribeToSkillsView(() => setShowSkills(isSkillsViewOpen())), [])
  useEffect(() => {
    if (!panelHeader) return undefined
    panelHeader.setActions(() => {
      // Vista de skills abierta: el header queda SÓLO con la salida. La `key`
      // distinta por vista fuerza el remount y dispara la animación de entrada.
      if (showSkills) {
        return (
          <HeaderActionButton
            key="chat.skills-back"
            id="chat.skills-back"
            label="Volver al chat"
            icon="chevron-right"
            iconRotation={180}
            size="sm"
            className={styles.headerActionEnter}
            onClick={() => setSkillsViewOpen(false)}
          />
        )
      }
      // Vista de historial abierta: misma mecánica que skills (vista propia
      // con su botón de volver, no un toggle que se apaga desde el header).
      if (showHistory) {
        return (
          <HeaderActionButton
            key="chat.history-back"
            id="chat.history-back"
            label="Volver al chat"
            icon="chevron-right"
            iconRotation={180}
            size="sm"
            className={styles.headerActionEnter}
            onClick={() => setHistoryViewOpen(false)}
          />
        )
      }
      // Chat: abrir historial + nuevo chat.
      return (
        <>
          <HeaderActionButton
            key="chat.history"
            id="chat.history"
            label="Historial de chats"
            icon="history"
            size="sm"
            className={styles.headerActionEnter}
            onClick={() => {
              // Historial y skills comparten el panel: abrir uno cierra el otro.
              setSkillsViewOpen(false)
              setHistoryViewOpen(true)
            }}
          />
          <HeaderActionButton
            id="chat.new-session"
            label="Nuevo chat"
            icon="plus"
            size="sm"
            onClick={() => createSession()}
          />
        </>
      )
    })
    return () => panelHeader.setActions(null)
  }, [panelHeader, createSession, showSkills, showHistory])

  // Título del header: "Chat: {nombre}" con el título real de la sesión (lo
  // setea solo con el primer mensaje o la tool history_title). Sin sesión o
  // sin título propio queda "Chat" a secas. Cuando hay una vista embebida
  // abierta, el header deja de ser el chat: pasa a "Skills" o "Historial".
  useEffect(() => {
    if (!panelHeader) return undefined
    if (showSkills) {
      panelHeader.setTitle('Skills')
      return undefined
    }
    if (showHistory) {
      panelHeader.setTitle('Historial')
      return undefined
    }
    const name = activeSession?.title?.trim()
    panelHeader.setTitle(name && name !== 'Nuevo chat' ? `Chat: ${name}` : 'Chat')
    return undefined
  }, [panelHeader, activeSession?.title, showSkills, showHistory])

  // API pública del chat: cualquier subsistema puede insertar contenido
  // (skills desde una librería, texto de un panel) y cae como mensaje del
  // usuario en la sesión activa.
  useEffect(() => {
    const onInsert = (event: Event): void => {
      const detail = (event as CustomEvent<ChatInsertPayload>).detail
      if (!detail?.text) return
      const targetId = sessionId ?? createSession()
      const content =
        detail.kind === 'skill' && detail.name
          ? `<skill name="${detail.name}">\n${detail.text}\n</skill>`
          : detail.text
      appendMessage(targetId, {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: Date.now()
      })
    }
    window.addEventListener('chat:insert', onInsert)
    return () => window.removeEventListener('chat:insert', onInsert)
  }, [sessionId, createSession, appendMessage])

  // Encola un mensaje de respuesta vacío y lo va llenando en vivo con el
  // stream (razonamiento y contenido por separado). Lo comparten el envío
  // normal y el "Regenerar". Si el modelo emite tool calls, el servicio las
  // ejecuta y las cards aparecen inline en la burbuja (ToolCallsBlock).
  const streamReply = useCallback(
    async (targetId: string, content: string, history: ChatMessage[]): Promise<void> => {
      setIsBusy(true)
      const controller = new AbortController()
      abortRef.current = controller

      /**
       * Un SEGMENTO por ronda del ciclo agéntico — espeja 1:1 el array de
       * mensajes del LLM: [reasoning+contenido+tools] → [tools results] →
       * [reasoning+contenido+tools] → … Así los thinking y tools de rondas
       * consecutivas quedan como historial separado y constante.
       */
      let currentSegmentId: string | null = null
      type SegmentTools = {
        calls: ToolCallInfo[]
        results: Record<string, ToolResultInfo>
      }
      const segments = new Map<string, SegmentTools>()

      // Deltas del stream agrupados por frame: un `setState` por TOKEN
      // re-renderiza todo el panel; agrupando, como mucho uno por frame.
      const pendingContent = new Map<string, string>()
      const pendingReasoning = new Map<string, string>()
      let flushHandle: number | null = null

      const flushDeltas = (): void => {
        flushHandle = null
        if (pendingContent.size === 0 && pendingReasoning.size === 0) return
        const contentBySegment = new Map(pendingContent)
        const reasoningBySegment = new Map(pendingReasoning)
        pendingContent.clear()
        pendingReasoning.clear()
        for (const [id, delta] of contentBySegment) {
          patchSegment(id, (message) => ({ ...message, content: message.content + delta }))
        }
        for (const [id, delta] of reasoningBySegment) {
          patchSegment(id, (message) => ({
            ...message,
            reasoning: (message.reasoning ?? '') + delta
          }))
        }
      }

      const scheduleFlush = (): void => {
        if (flushHandle !== null) return
        flushHandle = requestAnimationFrame(flushDeltas)
      }

      /** Vuelca lo pendiente YA (fin de ronda, tools, fin del stream). */
      const flushNow = (): void => {
        if (flushHandle !== null) {
          cancelAnimationFrame(flushHandle)
          flushHandle = null
        }
        flushDeltas()
      }

      const startSegment = (): void => {
        // La ronda anterior pudo dejar deltas sin volcar: se aplican antes de
        // crear el segmento nuevo para no perder orden.
        flushNow()
        const id = crypto.randomUUID()
        currentSegmentId = id
        segments.set(id, { calls: [], results: {} })
        appendMessage(targetId, {
          id,
          role: 'assistant',
          content: '',
          timestamp: Date.now()
        })
      }

      const patchSegment = (
        segmentId: string,
        updater: (message: ChatMessage) => ChatMessage
      ): void => {
        updateMessage(targetId, segmentId, updater)
      }

      const syncToolState = (segmentId: string): void => {
        const state = segments.get(segmentId)
        if (!state) return
        patchSegment(segmentId, (message) => ({
          ...message,
          tool_calls: [...state.calls],
          tool_results: { ...state.results }
        }))
      }

      try {
        await service.sendMessage({
          provider: activeProvider,
          apiKey: activeProvider ? getApiKey(activeProvider.id) : '',
          model: activeProvider ? getModel(activeProvider.id) : '',
          thinkingMode: activeProvider ? getThinkingMode(activeProvider.id) : 'auto',
          variant: activeProvider ? getVariant(activeProvider.id) : '',
          content,
          history,
          sessionId: targetId,
          // Botón "Detener": el servicio corta el stream y resuelve con lo
          // parcial (sin error), así la respuesta quedada no se pisa.
          signal: controller.signal,
          onRoundStart: () => startSegment(),
          onReasoning: (delta) => {
            const id = currentSegmentId
            if (!id) return
            pendingReasoning.set(id, (pendingReasoning.get(id) ?? '') + delta)
            scheduleFlush()
          },
          onContent: (delta) => {
            const id = currentSegmentId
            if (!id) return
            pendingContent.set(id, (pendingContent.get(id) ?? '') + delta)
            scheduleFlush()
          },
          onToolCalls: (calls) => {
            const id = currentSegmentId
            if (!id) return
            flushNow()
            const state = segments.get(id)
            if (!state) return
            state.calls = [...calls]
            syncToolState(id)
          },
          onToolResult: (toolCallId, result) => {
            const id = currentSegmentId
            if (!id) return
            flushNow()
            const state = segments.get(id)
            if (!state) return
            state.results[toolCallId] = result
            syncToolState(id)
          }
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Ups, algo salió mal. Prueba de nuevo.'
        if (currentSegmentId) {
          patchSegment(currentSegmentId, (current) => ({
            ...current,
            // Si el stream ya acumuló contenido, se conserva y se anexa el error.
            content: current.content ? `${current.content}\n\n${message}` : message
          }))
        } else {
          appendMessage(targetId, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `⚠ ${message}`,
            timestamp: Date.now()
          })
        }
      } finally {
        // El último delta pudo quedar en el buffer: se vuelca antes de cerrar.
        flushNow()
        abortRef.current = null
        setIsBusy(false)
      }
    },
    [service, activeProvider, getApiKey, getModel, getThinkingMode, appendMessage, updateMessage]
  )

  // Detener la generación en curso: aborta el stream y las tools pendientes.
  const handleStop = useCallback((): void => {
    abortRef.current?.abort()
  }, [])

  const handleSend = useCallback(
    async (content: string): Promise<void> => {
      const trimmed = content.trim()
      if (!trimmed || isBusy) return

      // Comando con barra: NO va al modelo. Se ejecuta por el sistema de
      // comandos; si el comando mostró su propia UI, no se agrega nada.
      if (isSlashInput(trimmed)) {
        const result = await slashCommands.run(trimmed, { source: 'chat', sessionId: sessionId ?? null })
        if (result.ok && result.ui) return
        const targetId = sessionId ?? createSession()
        appendMessage(targetId, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: result.ok ? (result.message ?? 'Listo.') : `⚠ ${result.error ?? 'Error'}`,
          timestamp: Date.now()
        })
        return
      }

      // Mención de subagente: `@agente <tarea>` spawnea el CHAT del subagente
      // en un modal sin overlay y agrega la traza al chat principal.
      const mention = /^@([A-Za-z0-9_-]+)\s+([\s\S]+)$/.exec(trimmed)
      if (mention && agentRegistry.getSubagent(mention[1])) {
        const targetId = sessionId ?? createSession()
        appendMessage(targetId, {
          id: crypto.randomUUID(),
          role: 'user',
          content: trimmed,
          timestamp: Date.now()
        })
        spawnSubagentChat({
          agentId: mention[1],
          prompt: mention[2],
          sessionId: targetId,
          texts: {
            title: agentRegistry.getSubagent(mention[1])?.label,
            lockedText: 'Estás dentro de un subagente: el chat principal está bloqueado'
          }
        })
        return
      }

      // Si no hay sesión activa (o arrancamos de cero), se crea una.
      const targetId = sessionId ?? createSession()

      appendMessage(targetId, {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now()
      })

      await streamReply(targetId, trimmed, messages)
    },
    [isBusy, sessionId, createSession, appendMessage, updateMessage, streamReply, messages]
  )

  // Regenerar: borra la última respuesta de la IA y vuelve a enviar el último
  // mensaje del usuario, usando como contexto todo lo anterior a ese mensaje.
  const handleRegenerate = useCallback(async (): Promise<void> => {
    if (!sessionId || isBusy) return

    let lastUserIndex = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIndex = i
        break
      }
    }
    if (lastUserIndex < 0) return

    const content = messages[lastUserIndex].content
    const history = messages.slice(0, lastUserIndex)

    removeMessagesAfter(sessionId, lastUserIndex + 1)
    await streamReply(sessionId, content, history)
  }, [sessionId, isBusy, messages, removeMessagesAfter, streamReply])

  // Contenido del chat: estado vacío (input centrado) o conversación.
  const chatBody =
    messages.length === 0 ? (
      <div className={styles.emptyLayout}>
        <div
          role="img"
          aria-label="Scrakk Studio"
          className={styles.emptyLogo}
          style={{ WebkitMaskImage: `url("${scrakkLogoUrl}")`, maskImage: `url("${scrakkLogoUrl}")` }}
        />
        <TimeGreeting />
        <div className={styles.emptyInput}>
          <ChatModeBar />
          <div className={styles.inputGlow} data-max={effortMaxed ? '' : undefined}>
            <ModeGlow />
            <EffortSparks active={effortMaxed} />
            <ChatInput onSend={handleSend} busy={isBusy} onStop={handleStop} state={subagentViewOpen ? 'locked' : 'active'} />
          </div>
          <ComposerFooter variant={activeVariant} />
        </div>
      </div>
    ) : (
      <>
        <div className={styles.body}>
          {/* key por sesión: al cambiar de chat, la lista arranca abajo (lo último). */}
          <div className={styles.messages}>
            <MessageList
              key={sessionId}
              className={styles.messagesList}
              messages={messages}
              isStreaming={isBusy}
              onRegenerate={handleRegenerate}
            />
          </div>
        </div>
        <div className={styles.composer}>
          <ChatModeBar />
          <div className={styles.inputGlow} data-max={effortMaxed ? '' : undefined}>
            <ModeGlow />
            <EffortSparks active={effortMaxed} />
            <ChatInput onSend={handleSend} busy={isBusy} onStop={handleStop} state={subagentViewOpen ? 'locked' : 'active'} />
          </div>
          <ComposerFooter variant={activeVariant} />
        </div>
      </>
    )

  // Historial y skills REEMPLAZAN el contenido del panel (no son columnas al
  // lado ni tabs aparte): el panel de chat suele vivir en una sidebar de
  // ~300px y partirla dejaría dos columnas inservibles. Son mutuamente
  // excluyentes. Elegir un chat (o crear uno) cierra el historial.
  return (
    <main className={styles.screen} data-modal-portal="chat">
      {showSkills ? (
        <div className={styles.historyView} data-skills-view="">
          <SkillsPanel />
        </div>
      ) : showHistory ? (
        <div className={styles.historyView} data-history-view="">
          <HistoryPanel onPick={() => setHistoryViewOpen(false)} />
        </div>
      ) : (
        chatBody
      )}
    </main>
  )
}