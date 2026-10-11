// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { memo, useEffect, useMemo, useRef, type JSX, type UIEvent } from 'react'
import type { DirectMessage, Friend } from '@shared/social'
import type { MyProfile } from '../../state/types'
import { MessageBubble, type SenderProfile } from '../MessageBubble/MessageBubble'
import styles from './MessageList.module.css'

import { t, useLocale } from '@core/i18n'
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

/**
 * Formateadores de fecha cacheados a nivel de módulo.
 *
 * `toLocaleTimeString()` / `toLocaleDateString()` construyen un
 * `Intl.DateTimeFormat` nuevo en CADA llamada, y acá se llaman una vez por
 * mensaje (más el reloj de cada bubble). Con un chat largo eso son cientos de
 * construcciones de formateador por render. `Intl` sí cachea internamente los
 * datos regionalizados, pero no el objeto formatter.
 */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>()

function cachedFormatter(kind: 'day' | 'time', locale: string): Intl.DateTimeFormat {
  const key = `${kind}:${locale}`
  let hit = FORMATTERS.get(key)
  if (!hit) {
    hit =
      kind === 'day'
        ? new Intl.DateTimeFormat(locale || undefined, { day: '2-digit', month: 'short' })
        : new Intl.DateTimeFormat(locale || undefined, { hour: '2-digit', minute: '2-digit' })
    FORMATTERS.set(key, hit)
  }
  return hit
}

/** Clave de día local (`año-mes-día`) sin pasar por `toDateString()`. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/**
 * Etiqueta del separador de día ("Hoy", "Ayer" o la fecha corta).
 *
 * `todayKey`/`yesterdayKey` se calculan UNA vez por pasada (no dos `Date` por
 * mensaje) y el resultado se cachea por texto de timestamp: cambiar la
 * presencia de un amigo re-renderiza la lista y no debe reformatear fechas.
 */
const dayLabelCache = new Map<string, string>()

function dayLabel(
  timestamp: string,
  todayKey: string,
  yesterdayKey: string,
  locale: string
): string {
  const hit = dayLabelCache.get(timestamp)
  if (hit !== undefined) return hit
  const date = new Date(timestamp)
  const key = dayKey(date)
  const label =
    key === todayKey ? t('social.hoy') : key === yesterdayKey ? t('social.ayer') : cachedFormatter('day', locale).format(date)
  dayLabelCache.set(timestamp, label)
  return label
}

function statusLabel(status: string): string {
  switch (status) {
    case 'online':
      return t('social.en.linea')
    case 'away':
      return t('social.ausente')
    case 'busy':
      return t('social.ocupado')
    default:
      return t('social.desconectado')
  }
}

const GROUP_WINDOW_MS = 5 * 60 * 1000

/**
 * Lista Discord-style: agrupa mensajes del mismo autor dentro de 5m.
 * Solo el líder del grupo muestra header (nombre + hora).
 */
/**
 * `memo`: el panel Social re-renderiza seguido (contexto grande) y esta lista
 * sólo depende de los mensajes y de los perfiles. Con esto, un cambio que no
 * toca los mensajes (presencia, typing, cuentas) no la recorre.
 */
function MessageListImpl({ messages, meId, friends, meName, meAvatar, meProfile, friendsPresence, className, onReply, onEdit, onDelete, hasMore, loadingMore, onLoadMore, conversationId }: MessageListProps): JSX.Element {
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

  // ── Datos derivados, memoizados ────────────────────────────────────────────
  // Antes se armaban en CADA render: con un chat largo eso son 3 Maps por
  // render, y lo peor, un objeto `senderProfile` NUEVO por mensaje, que hace
  // fallar la comparación de `memo(MessageBubble)` → todos los bubbles se
  // re-renderizaban aunque solo cambiara la presencia de un amigo.

  const { nameById, avatarById } = useMemo(() => {
    const names = new Map<string, string>()
    const avatars = new Map<string, string | null>()
    for (const f of friends) {
      names.set(f.id, f.displayName ?? f.handle ?? t('social.usuario'))
      avatars.set(f.id, f.avatarUrl)
    }
    names.set(meId, meName)
    if (meAvatar) avatars.set(meId, meAvatar)
    return { nameById: names, avatarById: avatars }
  }, [friends, meId, meName, meAvatar])

  /**
   * Perfil por REMITENTE (no por mensaje), con identidad estable.
   *
   * La clave para que `memo` sirva: si el objeto se reconstruye, todos los
   * mensajes de ese remitente se re-renderizan. Se cachea por id y solo se
   * invalida cuando sus datos cambian de verdad (presencia, bio, actividad).
   */
  const profileCacheRef = useRef(new Map<string, { sig: string; value: SenderProfile }>())

  const profileBySender = useMemo(() => {
    const cache = profileCacheRef.current
    const next = new Map<string, SenderProfile>()

    const keep = (id: string, value: SenderProfile): void => {
      const sig = JSON.stringify(value)
      const hit = cache.get(id)
      if (hit && hit.sig === sig) {
        next.set(id, hit.value)
        return
      }
      cache.set(id, { sig, value })
      next.set(id, value)
    }

    if (meProfile) {
      keep(meId, {
        handle: meProfile.handle || null,
        bio: meProfile.description ?? null,
        gender: meProfile.gender ?? null,
        customStatus: meProfile.customStatus ?? null,
        customStatusExpiresAt: meProfile.customStatusExpiresAt ?? null,
        presence: meProfile.presence,
        statusLabel: meProfile.presence ? statusLabel(meProfile.presence) : undefined,
        project: meProfile.activity?.project ?? null,
        file: meProfile.activity?.file ?? null
      })
    }
    for (const f of friends) {
      const presence = friendsPresence?.[f.id]
      keep(f.id, {
        handle: f.handle,
        verified: f.verified,
        bio: f.bio,
        gender: f.gender,
        customStatus: f.customStatus,
        customStatusExpiresAt: f.customStatusExpiresAt,
        presence: presence?.status,
        statusLabel: presence ? statusLabel(presence.status) : undefined,
        project: presence?.activity.project ?? null,
        file: presence?.activity.file ?? null
      })
    }

    // Poda: amigos que ya no están (el Map no crece con el churn).
    for (const id of [...cache.keys()]) if (!next.has(id)) cache.delete(id)
    return next
  }, [friends, friendsPresence, meProfile, meId])

  let lastDay = ''
  let lastSender: string | null = null
  let lastTime = 0
  const locale = useLocale()
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const todayKey = dayKey(today)
  const yesterdayKey = dayKey(yesterday)

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
        <p className={styles.empty}>{t('social.todavia.no.hay.mensajes.escribe')}</p>
      ) : (
        messages.map((message) => {
          const day = dayLabel(message.createdAt, todayKey, yesterdayKey, locale)
          const showDay = day !== lastDay
          if (showDay) lastDay = day

          const isOwn = message.senderId === meId
          // `Date.parse` en vez de `new Date(...).getTime()`: mismo número, sin
          // construir un objeto Date por mensaje.
          const time = Date.parse(message.createdAt)
          const isSameSender = lastSender === message.senderId
          const withinWindow = isSameSender && time - lastTime < GROUP_WINDOW_MS
          const showHeader = showDay || !withinWindow

          // Update trackers
          lastSender = message.senderId
          lastTime = time

          const senderName = nameById.get(message.senderId) ?? t('social.usuario')
          const senderAvatar = avatarById.get(message.senderId) ?? (message.senderId === meId ? meAvatar : null)
          // Del cache por remitente: identidad estable → `memo` funciona.
          const senderProfile = profileBySender.get(message.senderId)
          const replySenderName = message.replyPreview
            ? nameById.get(message.replyPreview.senderId) ?? t('social.usuario')
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

export const MessageList = memo(MessageListImpl)
