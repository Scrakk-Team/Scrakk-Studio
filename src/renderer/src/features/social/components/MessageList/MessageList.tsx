// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useRef, type JSX, type UIEvent } from 'react'
import type { DirectMessage, Friend } from '@shared/social'
import type { MyProfile } from '../../state/types'
import { MessageBubble } from '../MessageBubble/MessageBubble'
import styles from './MessageList.module.css'

interface MessageListProps {
  messages: DirectMessage[]
  /** Tu id (para distinguir propios de ajenos). */
  meId: string
  friends: Friend[]
  meName: string
  meAvatar?: string | null
  /** Tu perfil completo (para la card flotante en tus propios mensajes). */
  meProfile?: MyProfile
  friendsPresence?: Record<string, { status: string; activity: { project?: string; file?: string } }>
  className?: string
  onReply?: (message: DirectMessage) => void
  onEdit?: (messageId: string, body: string) => void
  onDelete?: (messageId: string) => void
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  /** Id de la conversación (amigo): clave de la memoria de scroll. */
  conversationId?: string
}

/** Recuerda dónde quedó el usuario en cada conversación. */
interface ScrollMemory {
  distanceFromBottom: number
  atBottom: boolean
  at: number
}

const scrollMemory = new Map<string, ScrollMemory>()
/** Si el usuario salió hace menos que esto, se respeta su posición; si no, al final. */
const RESTORE_WINDOW_MS = 10 * 60 * 1000
/** A qué distancia del fondo se considera "está al final". */
const BOTTOM_THRESHOLD = 120
/** A qué distancia del techo se pide la página anterior. */
const LOAD_MORE_THRESHOLD = 120

/** Etiqueta del separador de día ("Hoy", "Ayer" o la fecha corta). */
function dayLabel(timestamp: string): string {
  const date = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString()
  if (sameDay(date, today)) return 'Hoy'
  if (sameDay(date, yesterday)) return 'Ayer'
  return date.toLocaleDateString([], { day: '2-digit', month: 'short' })
}

function statusLabel(status: string): string {
  switch (status) {
    case 'online':
      return 'En línea'
    case 'away':
      return 'Ausente'
    case 'busy':
      return 'Ocupado'
    default:
      return 'Desconectado'
  }
}

const GROUP_WINDOW_MS = 5 * 60 * 1000

/**
 * Lista Discord-style: agrupa mensajes del mismo autor dentro de 5m.
 * Solo el líder del grupo muestra header (nombre + hora).
 */
export function MessageList({ messages, meId, friends, meName, meAvatar, meProfile, friendsPresence, className, onReply, onEdit, onDelete, hasMore, loadingMore, onLoadMore, conversationId }: MessageListProps): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  const prevHeightRef = useRef(0)
  const pendingScrollRef = useRef<
    { mode: 'bottom' } | { mode: 'restore'; distanceFromBottom: number } | null
  >(null)
  const lastProgrammaticAtRef = useRef(0)
  const saveHandleRef = useRef<number | null>(null)

  // Al cambiar de conversación: decidir dónde posicionarse. Si el usuario salió
  // hace poco y no estaba al final, se respeta su zona; si no, va al último
  // mensaje. Se aplica cuando llega el primer lote (efecto de abajo).
  useEffect(() => {
    const saved = conversationId ? scrollMemory.get(conversationId) : undefined
    const recent = saved ? Date.now() - saved.at < RESTORE_WINDOW_MS : false
    pendingScrollRef.current =
      recent && saved && !saved.atBottom
        ? { mode: 'restore', distanceFromBottom: saved.distanceFromBottom }
        : { mode: 'bottom' }
    prevHeightRef.current = 0
    return () => {
      if (saveHandleRef.current !== null) cancelAnimationFrame(saveHandleRef.current)
      saveHandleRef.current = null
    }
  }, [conversationId])

  // Posicionamiento: aplicar el pendiente, anclar al prepend y seguir el fondo
  // solo si el usuario ya estaba cerca del final.
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const pending = pendingScrollRef.current
    if (pending) {
      if (messages.length === 0) return
      lastProgrammaticAtRef.current = performance.now()
      el.scrollTop =
        pending.mode === 'bottom'
          ? el.scrollHeight
          : Math.max(0, el.scrollHeight - el.clientHeight - pending.distanceFromBottom)
      pendingScrollRef.current = null
      prevHeightRef.current = 0
      return
    }
    // Recién se prependió una página: mantener la vista en el mismo mensaje.
    if (prevHeightRef.current && el.scrollHeight !== prevHeightRef.current) {
      lastProgrammaticAtRef.current = performance.now()
      el.scrollTop += el.scrollHeight - prevHeightRef.current
      prevHeightRef.current = 0
      return
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < BOTTOM_THRESHOLD) {
      lastProgrammaticAtRef.current = performance.now()
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // Guardar la posición recordada y pedir la página anterior SOLO cuando el
  // usuario sube a mano. Antes se usaba un IntersectionObserver en el centinela
  // de arriba: con contenido corto quedaba visible y encadenaba páginas hasta
  // agotar el historial (el "carga todo lo de arriba").
  const handleScroll = (event: UIEvent<HTMLDivElement>): void => {
    const el = event.currentTarget
    // Ignorar el scroll que provocamos nosotros (posicionar/anclar).
    if (performance.now() - lastProgrammaticAtRef.current < 64) return

    if (conversationId) {
      if (saveHandleRef.current !== null) cancelAnimationFrame(saveHandleRef.current)
      saveHandleRef.current = requestAnimationFrame(() => {
        saveHandleRef.current = null
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
        scrollMemory.set(conversationId, {
          distanceFromBottom,
          atBottom: distanceFromBottom < 24,
          at: Date.now()
        })
      })
    }

    if (el.scrollTop <= LOAD_MORE_THRESHOLD && hasMore && !loadingMore && onLoadMore) {
      prevHeightRef.current = el.scrollHeight
      onLoadMore()
    }
  }

  let lastDay = ''
  let lastSender: string | null = null
  let lastTime = 0

  const nameById = new Map<string, string>()
  const avatarById = new Map<string, string | null>()
  const friendById = new Map<string, Friend>()
  for (const f of friends) {
    nameById.set(f.id, f.displayName ?? f.handle ?? 'Usuario')
    avatarById.set(f.id, f.avatarUrl)
    friendById.set(f.id, f)
  }
  nameById.set(meId, meName)
  if (meAvatar) avatarById.set(meId, meAvatar)

  return (
    <div
      ref={listRef}
      className={className ? `${styles.list} ${className}` : styles.list}
      role="log"
      aria-live="polite"
      onScroll={handleScroll}
    >
      {loadingMore
        ? Array.from({ length: 3 }).map((_, i) => (
            <div key={`ph-${i}`} className={styles.placeholder}>
              <div className={styles.phAvatar} />
              <div className={styles.phContent}>
                <div className={styles.phLine} style={{ width: '30%' }} />
                <div className={styles.phLine} style={{ width: '80%' }} />
              </div>
            </div>
          ))
        : null}
      {messages.length === 0 && !loadingMore ? (
        <p className={styles.empty}>Todavía no hay mensajes. Escribe el primero.</p>
      ) : (
        messages.map((message) => {
          const day = dayLabel(message.createdAt)
          const showDay = day !== lastDay
          if (showDay) lastDay = day

          const isOwn = message.senderId === meId
          const time = new Date(message.createdAt).getTime()
          const isSameSender = lastSender === message.senderId
          const withinWindow = isSameSender && time - lastTime < GROUP_WINDOW_MS
          const showHeader = showDay || !withinWindow

          // Update trackers
          lastSender = message.senderId
          lastTime = time

          const senderName = nameById.get(message.senderId) ?? 'Usuario'
          const senderAvatar = avatarById.get(message.senderId) ?? (message.senderId === meId ? meAvatar : null)
          const friend = friendById.get(message.senderId)
          const presence = friendsPresence?.[message.senderId]
          const senderProfile = isOwn
            ? meProfile
              ? {
                  handle: meProfile.handle || null,
                  bio: meProfile.description ?? null,
                  gender: meProfile.gender ?? null,
                  customStatus: meProfile.customStatus ?? null,
                  customStatusExpiresAt: meProfile.customStatusExpiresAt ?? null,
                  createdAt: meProfile.createdAt ?? null,
                  presence: meProfile.presence,
                  statusLabel: meProfile.presence ? statusLabel(meProfile.presence) : undefined,
                  project: meProfile.activity?.project ?? null,
                  file: meProfile.activity?.file ?? null
                }
              : undefined
            : friend
              ? {
                  handle: friend.handle,
                  bio: friend.bio,
                  gender: friend.gender,
                  customStatus: friend.customStatus,
                  customStatusExpiresAt: friend.customStatusExpiresAt,
                  createdAt: friend.createdAt ?? null,
                  presence: presence?.status,
                  statusLabel: presence ? statusLabel(presence.status) : undefined,
                  project: presence?.activity.project ?? null,
                  file: presence?.activity.file ?? null
                }
              : undefined
          const replySenderName = message.replyPreview
            ? nameById.get(message.replyPreview.senderId) ?? 'Usuario'
            : undefined

          return (
            <div key={message.id} className={styles.item}>
              {showDay ? (
                <div className={styles.day}>
                  <span className={styles.dayPill}>{day}</span>
                </div>
              ) : null}
              <MessageBubble
                message={message}
                isOwn={isOwn}
                showHeader={showHeader}
                senderName={senderName}
                avatarUrl={senderAvatar}
                senderProfile={senderProfile}
                replySenderName={replySenderName}
                onReply={onReply}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </div>
          )
        })
      )}
    </div>
  )
}
