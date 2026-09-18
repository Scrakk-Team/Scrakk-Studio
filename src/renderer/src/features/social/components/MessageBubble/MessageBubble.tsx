import { memo, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { showModal } from '@services/modals'
import type { DirectMessage } from '@shared/social'
import { UserAvatar } from '../UserAvatar/UserAvatar'
import { ProfileView } from '../ProfileView/ProfileView'
import { showFloatingProfile } from '../ProfileFloating/ProfileFloating'
import styles from './MessageBubble.module.css'

interface MessageBubbleProps {
  message: DirectMessage
  isOwn: boolean
  showHeader: boolean
  senderName: string
  avatarUrl?: string | null
  senderProfile?: { handle?: string | null; bio?: string | null; gender?: string | null; customStatus?: string | null; customStatusExpiresAt?: string | null; presence?: string; statusLabel?: string; project?: string | null; file?: string | null }
  onReply?: (message: DirectMessage) => void
  onEdit?: (id: string, body: string) => void
  onDelete?: (id: string) => void
  replySenderName?: string
}

function timeOf(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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

/**
 * Discord-style message: avatar per group, no cards, hour only on leader.
 * Optimized with memo: only re-renders when props change.
 */
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
            </button>
            <span className={styles.time}>{timeOf(message.createdAt)}</span>
            {message.editedAt ? <span className={styles.edited}>(editado)</span> : null}
          </div>
        ) : null}

        {message.replyPreview ? (
          <div className={styles.replyQuote}>
            <span className={styles.replyBar} />
            <span className={styles.replyName}>{replySenderName ?? 'Mensaje'}</span>
            <span className={styles.replyBody}>{message.replyPreview.body.slice(0, 80)}</span>
          </div>
        ) : null}

        {editing ? (
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
        ) : (
          <div className={styles.body}>{renderWithMentions(message.body)}</div>
        )}
      </div>

      <div className={styles.actions}>
        <button className={styles.actionBtn} onClick={() => onReply?.(message)} title="Responder">
          <ProductIcon id="reply" size={14} />
        </button>
        {isOwn ? (
          <>
            <button className={styles.actionBtn} onClick={handleEdit} title="Editar">
              <ProductIcon id="pencil" size={14} />
            </button>
            <button className={styles.actionBtn} onClick={() => onDelete?.(message.id)} title="Borrar">
              <ProductIcon id="trash" size={14} />
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
})
