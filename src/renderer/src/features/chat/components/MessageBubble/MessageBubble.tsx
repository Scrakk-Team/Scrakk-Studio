// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ChatMessage } from '@services/chat'
import { ProductIcon } from '@services/productIcons/components'
import { memo, useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { Markdown } from '../Markdown/Markdown'
import { MessageActions } from '../MessageActions/MessageActions'
import { ToolCallsBlock } from '../ToolCallsBlock'
import styles from './MessageBubble.module.css'

import { t } from '@core/i18n'

/**
 * Contenido para el markdown, actualizado a lo sumo cada `ms`.
 *
 * Mientras la IA streamea, `content` cambia por frame; parsear markdown
 * (react-markdown + Prism) en cada frame es O(n) por frame. Con el throttle se
 * refresca ~7 veces/s: el markdown se ve EN VIVO sin comerse el hilo. Al terminar
 * (`pending` false) se usa el contenido completo, sin throttle.
 */
function useThrottled(value: string, ms: number): string {
  const [out, setOut] = useState(value)
  const lastRef = useRef(0)
  useEffect(() => {
    if (value === out) return
    const elapsed = Date.now() - lastRef.current
    if (elapsed >= ms) {
      lastRef.current = Date.now()
      setOut(value)
      return
    }
    const handle = window.setTimeout(() => {
      lastRef.current = Date.now()
      setOut(value)
    }, ms - elapsed)
    return () => window.clearTimeout(handle)
  }, [value, ms, out])
  return out
}

interface MessageBubbleProps {
  message: ChatMessage
  /** true mientras el mensaje se está armando (stream): oculta las acciones. */
  pending?: boolean
  /** Si viene, la última respuesta de la IA muestra el botón "Regenerar". */
  onRegenerate?: () => void
  /**
   * Guarda la edición del mensaje. El llamador decide qué implica: un mensaje
   * del USUARIO editado se reenvía (lo de después ya no responde a ese texto),
   * uno de la IA sólo se actualiza.
   */
  onEditSave?: (messageId: string, content: string) => void
  /** Si es false no se ofrece editar (p. ej. mientras el modelo genera). */
  canEdit?: boolean
  /** Si viene, la barra muestra "volver al mensaje" (sube el scroll a su lugar). */
  onJumpTo?: () => void
}

/**
 * Mensaje de chat.
 * User → burbuja accent compacta a la derecha, texto plano.
 * Assistant → texto a la izquierda sin fondo ni borde, renderizado en
 * markdown (código, tablas, listas, links). Las tool calls van DESPUÉS del
 * texto (el orden real del stream: el modelo escribe y después llama la
 * tool) y las acciones (copiar/editar/regenerar) cierran el mensaje al final.
 *
 * memo: el store preserva la identidad de los mensajes intactos por token,
 * así en un chat largo solo re-renderiza la burbuja que está streameando
 * (antes: cada token re-parseaba y re-resaltaba TODO el historial).
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  pending = false,
  onRegenerate,
  onEditSave,
  canEdit = false,
  onJumpTo
}: MessageBubbleProps): JSX.Element {
  const isUser = message.role === 'user'
  const rowClass = isUser ? styles.rowUser : styles.rowAssistant
  const bubbleClass = isUser ? styles.bubbleUser : styles.bubbleAssistant

  // Edición inline del mensaje (textarea en el lugar del contenido).
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  // Markdown en vivo: el contenido del stream, throttleado (ver `useThrottled`).
  const liveContent = useThrottled(message.content, 150)

  // Mensaje del USUARIO largo: se recorta a unas líneas (el recorte agrega el
  // "…") y el botón de al lado lo expande/contrae. Sin el tope, un pegado
  // enorme (un log, un archivo) empujaba el chat una pantalla entera hacia
  // abajo. `canExpand` sale de MEDIR, no de un largo en caracteres: así el
  // botón sólo aparece cuando el texto realmente desborda el recorte.
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)
  const userTextRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = userTextRef.current
    if (!el || !isUser) {
      setCanExpand(false)
      return
    }
    // Ya expandido no se re-mide: sin el recorte el texto entra entero y el
    // botón (que ahora es "contraer") desaparecería.
    if (expanded) return
    setCanExpand(el.scrollHeight > el.clientHeight + 1)
  }, [message.content, isUser, expanded])

  const hasToolCalls = !isUser && message.tool_calls && message.tool_calls.length > 0
  const hasText = message.content.trim().length > 0
  // La barra es la MISMA para los dos roles (copiar / regenerar), pero EDITAR
  // es sólo del mensaje del usuario: la respuesta de la IA no se reescribe.
  // Sin acciones en mensajes con herramientas: la respuesta final (la que no
  // trae tool calls) es la única con texto propio.
  const showActions = !editing && !pending && !hasToolCalls && hasText

  const startEdit = (): void => {
    setDraft(message.content)
    setEditing(true)
  }

  const saveEdit = (): void => {
    const next = draft.trim()
    // Un mensaje vacío no se guarda: el editor queda abierto para corregirlo.
    if (!next) return
    setEditing(false)
    if (next === message.content) return
    onEditSave?.(message.id, next)
  }

  const onEditKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setEditing(false)
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      // Enter solo inserta salto (es un textarea): guardar es Cmd/Ctrl+Enter.
      event.preventDefault()
      saveEdit()
    }
  }

  // La barra se arma una sola vez y cada rol la coloca: en el mensaje del
  // usuario va DENTRO de la burbuja; en la respuesta de la IA, debajo.
  const actions = showActions ? (
    <MessageActions
      content={message.content}
      onRegenerate={onRegenerate}
      // Sólo el mensaje del USUARIO se edita (y reenvía). La respuesta de la
      // IA se lee y se copia: reescribirla no es una acción del chat.
      onEdit={isUser && canEdit && onEditSave ? startEdit : undefined}
      onJumpTo={onJumpTo}
    />
  ) : null

  return (
    <div className={`${styles.row} ${rowClass}`}>
      {/* La PILA (burbuja + sus acciones) es el ítem de la fila: así las
          acciones quedan DEBAJO de la burbuja y no encima de su fondo (en el
          mensaje del usuario se veían sobre el color). */}
      <div className={`${styles.stack} ${isUser ? styles.stackUser : styles.stackAssistant}`}>
        <div className={`${styles.bubble} ${bubbleClass}`}>
          {editing ? (
            <div className={styles.editBox}>
              {/* El marco lo lleva el CONTENEDOR y sólo al enfocar: el textarea
                  va sin borde, sin fondo y sin resize. Mismo criterio que el
                  composer del chat (el handle nativo dibujaba un grip de más). */}
              <div className={styles.editField}>
                <textarea
                  className={styles.editArea}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onEditKeyDown}
                  // Alto según las líneas reales (acotado): editar un párrafo largo
                  // no arranca en un input de una línea.
                  rows={Math.min(12, Math.max(2, draft.split('\n').length))}
                  autoFocus
                  aria-label={t('chat.editar.mensaje')}
                />
              </div>
              <div className={styles.editActions}>
                <button
                  type="button"
                  className={styles.editCancel}
                  onClick={() => setEditing(false)}
                >
                  {t('chat.cancelar.edicion')}
                </button>
                <button
                  type="button"
                  className={styles.editSave}
                  onClick={saveEdit}
                  disabled={!draft.trim()}
                >
                  {t('chat.guardar.cambios')}
                </button>
              </div>
            </div>
          ) : isUser ? (
            <>
              {/* El recorte va en un span INTERNO: `-webkit-line-clamp` exige
                  `display:-webkit-box` y no es fiable como ítem de flex, que es
                  lo que es `.userText` (texto + botón + acciones en una fila). */}
              <span className={styles.userText}>
                <span
                  ref={userTextRef}
                  className={expanded ? undefined : styles.userTextClamped}
                >
                  {message.content}
                </span>
              </span>
              {/* Sólo cuando el mensaje desborda el recorte. El `chevron-down`
                  gira al expandir (no hay `chevron-up` en el set). */}
              {canExpand ? (
                <button
                  type="button"
                  className={`${styles.expandBtn}${expanded ? ` ${styles.expandBtnOpen}` : ''}`}
                  aria-expanded={expanded}
                  aria-label={t(expanded ? 'chat.contraer' : 'chat.expandir')}
                  title={t(expanded ? 'chat.contraer' : 'chat.expandir')}
                  onClick={() => setExpanded((prev) => !prev)}
                >
                  <ProductIcon id="chevron-down" size={13} />
                </button>
              ) : null}
            </>
          ) : (
            // Markdown EN VIVO: también mientras streamea (antes se pintaba texto
            // plano hasta que terminaba). El contenido va throttleado durante el
            // stream para no re-parsear por frame.
            <Markdown content={pending ? liveContent : message.content} />
          )}

          {/* Tool calls DESPUÉS del texto: una tool que el modelo llama tras
              escribir aparece debajo de lo que escribió, no encima. */}
          {hasToolCalls ? (
            <ToolCallsBlock
              toolCalls={message.tool_calls!}
              toolResults={message.tool_results}
              status={pending ? 'running' : 'success'}
            />
          ) : null}
          {/* Usuario: copiar/editar DENTRO de su burbuja. */}
          {isUser ? actions : null}
        </div>

        {/* IA: debajo de la burbuja. */}
        {isUser ? null : actions}
      </div>
    </div>
  )
})
