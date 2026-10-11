// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { memo, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { showModal } from '@services/modals'
import type { DirectMessage } from '@shared/social'
import { decodeCodeFile } from '@shared/socialCodeFile'
import { SocialCodeCard } from '../SocialCodeCard/SocialCodeCard'
import { UserAvatar } from '../UserAvatar/UserAvatar'
import { ProfileView } from '../ProfileView/ProfileView'
import { VerifiedCheck } from '../VerifiedCheck/VerifiedCheck'
import { showFloatingProfile } from '../ProfileFloating/ProfileFloating'
import styles from './MessageBubble.module.css'

import { t } from '@core/i18n'
/**
 * Perfil del remitente que se muestra en la card flotante.
 *
 * Exportado para que `MessageList` lo construya una vez por REMITENTE (con
 * identidad estable) y no una vez por mensaje: un objeto nuevo por mensaje
 * rompe el `memo` de abajo y re-renderiza el chat entero.
 */
export interface SenderProfile {
  handle?: string | null
  verified?: boolean
  bio?: string | null
  gender?: string | null
  customStatus?: string | null
  customStatusExpiresAt?: string | null
  presence?: string
  statusLabel?: string
  project?: string | null
  file?: string | null
}

interface MessageBubbleProps {
  message: DirectMessage
  isOwn: boolean
  showHeader: boolean
  senderName: string
  avatarUrl?: string | null
  senderProfile?: SenderProfile
  onReply?: (message: DirectMessage) => void
  onEdit?: (id: string, body: string) => void
  onDelete?: (id: string) => void
  replySenderName?: string
}

/**
 * Reloj del bubble. `toLocaleTimeString` construye un `Intl.DateTimeFormat`
 * nuevo en cada llamada; se cachea el formateador por locale y el resultado
 * por timestamp (un mensaje repite su hora en dos sitios).
 */
const timeCache = new Map<string, string>()
let timeFormatter: Intl.DateTimeFormat | null = null
let timeFormatterLocale = ''

function timeOf(timestamp: string): string {
  const hit = timeCache.get(timestamp)
  if (hit !== undefined) return hit
  const locale = typeof navigator === 'undefined' ? '' : navigator.language
  if (!timeFormatter || timeFormatterLocale !== locale) {
    timeFormatter = new Intl.DateTimeFormat(locale || undefined, {
      hour: '2-digit',
      minute: '2-digit'
    })
    timeFormatterLocale = locale
  }
  const label = timeFormatter.format(new Date(timestamp))
  timeCache.set(timestamp, label)
  return label
}

/** Render body with @mentions highlighted like Discord */
function renderWithMentions(body: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = []
  const regex = /@([a-z0-9_]{3,24})/gi
  let last = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(body)) !== null) {
    if (m.index > last) parts.push(body.slice(last, m.index))
    parts.push(
      <span key={m.index} className={styles.mention}>
        @{m[1]}
      </span>
    )
    last = m.index + m[0].length
  }
  if (last < body.length) parts.push(body.slice(last))
  return parts.length > 0 ? parts : [body]
}

/** Cuenta emojis cuando el mensaje es SOLO emojis (para el tamaño "jumbo"). */
function emojiOnlyCount(body: string): number {
  const trimmed = body.trim()
  if (!trimmed) return 0
  if (/[A-Za-z0-9@#]/.test(trimmed)) return 0
  const clusters = trimmed.split(/\s+/).filter(Boolean)
  if (clusters.length === 0 || clusters.length > 3) return 0
  return clusters.every((cluster) => /\p{Extended_Pictographic}/u.test(cluster))
    ? clusters.length
    : 0
}

/**
 * Discord-style message: avatar per group, no cards, hour only on leader.
 * Optimized with memo: only re-renders when props change.
 */
/** Etiqueta de la cita: si el citado es un archivo, muestra su nombre. */
function replyPreviewLabel(body: string): string {
  const meta = decodeCodeFile(body)
  if (meta) return `${meta.name} · ${t('social.archivo')}`
  // Un mensaje que sólo lleva adjuntos (body vacío): sin esto la cita salía en blanco.
  if (!body.trim()) return t('social.imagen.adjunta')
  return body.slice(0, 80)
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  showHeader,
  senderName,
  avatarUrl,
  senderProfile,
  onReply,
  onEdit,
  onDelete,
  replySenderName
}: MessageBubbleProps): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(message.body)
  const jumbo = emojiOnlyCount(message.body)

  const handleEdit = () => {
    if (!editing) {
      setEditValue(message.body)
      setEditing(true)
    } else {
      onEdit?.(message.id, editValue)
      setEditing(false)
    }
  }

  const openProfile = (e: React.MouseEvent): void => {
    const anchor = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const p = senderProfile
    const profileData = {
      name: senderName,
      handle: p?.handle ?? null,
      verified: p?.verified,
      avatarUrl: avatarUrl ?? undefined,
      description: p?.bio ?? null,
      presence: p?.presence,
      statusLabel: p?.statusLabel,
      gender: p?.gender ?? null,
      customStatus: p?.customStatus ?? null,
      customStatusExpiresAt: p?.customStatusExpiresAt ?? null,
      project: p?.project ?? null,
      file: p?.file ?? null
    }
    showFloatingProfile({
      anchor,
      profile: profileData,
      onExpand: () => {
        showModal({
          title: senderName,
          size: 'sm',
          render: () => <ProfileView profile={profileData} config={{ avatarSize: 64, showDescription: true }} />
        })
      }
    })
  }

  return (
    <div
      className={[styles.row, showHeader ? styles.groupStart : styles.groupCont, editing ? styles.editing : ''].filter(Boolean).join(' ')}
    >
      <div className={styles.avatarCol}>
        {showHeader ? (
          <button type="button" onClick={openProfile} className={styles.avatarBtn} aria-label={`Ver perfil de ${senderName}`}>
            <UserAvatar name={senderName} src={avatarUrl ?? undefined} size={32} />
          </button>
        ) : (
          <span className={styles.timeHover}>{timeOf(message.createdAt)}</span>
        )}
      </div>
      <div className={styles.contentCol}>
        {showHeader ? (
          <div className={styles.header}>
            <button
              type="button"
              onClick={openProfile}
              className={[styles.name, styles.nameBtn, isOwn ? styles.nameOwn : ''].filter(Boolean).join(' ')}
            >
              {senderName}
              {senderProfile?.verified ? <VerifiedCheck /> : null}
            </button>
            <span className={styles.time}>{timeOf(message.createdAt)}</span>
            {message.editedAt ? <span className={styles.edited}>(editado)</span> : null}
          </div>
        ) : null}

        {message.replyPreview ? (
          <div className={styles.replyQuote}>
            <span className={styles.replyBar} />
            <span className={styles.replyName}>{replySenderName ?? t('social.mensaje')}</span>
            <span className={styles.replyBody}>{replyPreviewLabel(message.replyPreview.body)}</span>
          </div>
        ) : null}

        {message.kind === 'codefile' ? (
          <SocialCodeCard message={message} isOwn={isOwn} />
        ) : editing ? (
          <div className={styles.editRow}>
            <input
              className={styles.editInput}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleEdit()
                }
                if (e.key === 'Escape') setEditing(false)
              }}
              autoFocus
            />
            <button className={styles.editSave} onClick={handleEdit}>
              guardar
            </button>
            <button className={styles.editCancel} onClick={() => setEditing(false)}>
              cancelar
            </button>
          </div>
        ) : message.body.trim() ? (
          <div
            className={[
              styles.body,
              jumbo === 1 ? styles.jumbo1 : null,
              jumbo === 2 ? styles.jumbo2 : null,
              jumbo === 3 ? styles.jumbo3 : null
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {renderWithMentions(message.body)}
          </div>
        ) : null}
        {message.attachments && message.attachments.length > 0 ? (
          <div className={styles.attachGrid}>
            {message.attachments.map((a) => (
              <button
                key={a.id}
                type="button"
                className={styles.attachThumb}
                onClick={() => window.open(a.url, '_blank', 'noopener')}
                title={t('social.abrir.imagen.en.tamano.completo')}
              >
                <img src={a.url} alt={t('social.imagen.adjunta')} loading="lazy" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className={styles.actions}>
        <button className={styles.actionBtn} onClick={() => onReply?.(message)} title={t('social.responder')}>
          <ProductIcon id="reply" size={14} />
        </button>
        {isOwn ? (
          <>
            <button className={styles.actionBtn} onClick={handleEdit} title={t('social.editar')}>
              <ProductIcon id="pencil" size={14} />
            </button>
            <button className={styles.actionBtn} onClick={() => onDelete?.(message.id)} title={t('social.borrar')}>
              <ProductIcon id="trash" size={14} />
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
})
