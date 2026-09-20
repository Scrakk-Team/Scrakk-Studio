import { useEffect, useRef, type JSX } from 'react'
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
}

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
export function MessageList({ messages, meId, friends, meName, meAvatar, meProfile, friendsPresence, className, onReply, onEdit, onDelete, hasMore, loadingMore, onLoadMore }: MessageListProps): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(false)
  const prevHeightRef = useRef(0)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    if (!mountedRef.current) {
      mountedRef.current = true
      el.scrollTop = el.scrollHeight
      return
    }
    // If we just prepended (loadingMore finished), keep scroll anchored
    if (prevHeightRef.current && el.scrollHeight !== prevHeightRef.current) {
      const delta = el.scrollHeight - prevHeightRef.current
      el.scrollTop += delta
      prevHeightRef.current = 0
    } else {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      if (distanceFromBottom < 120) el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // Infinite scroll up: when sentinel visible, load more
  useEffect(() => {
    const el = listRef.current
    const sentinel = topSentinelRef.current
    if (!el || !sentinel || !onLoadMore || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) {
          prevHeightRef.current = el.scrollHeight
          onLoadMore()
        }
      },
      { root: el, threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, onLoadMore])

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
    >
      <div ref={topSentinelRef} style={{ height: 1, flexShrink: 0 }} aria-hidden="true" />
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
