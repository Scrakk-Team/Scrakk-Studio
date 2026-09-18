import type { JSX } from 'react'
import type { Friend, PresenceActivity, PresenceStatus } from '@shared/social'
import { UserAvatar } from '../UserAvatar/UserAvatar'
import styles from './FriendList.module.css'

interface FriendListProps {
  friends: Friend[]
  /** Id del amigo con el chat abierto (resalta la fila). */
  activeId?: string | null
  /** No leídos por amigo (id → cantidad). */
  unread?: Record<string, number>
  /** Presencia efectiva por amigo (id → estado + actividad). */
  presence?: Record<string, { status: PresenceStatus; activity: PresenceActivity }>
  onSelect: (friend: Friend) => void
}

export function presenceLabel(status: PresenceStatus): string {
  switch (status) {
    case 'online':
      return 'En línea'
    case 'away':
      return 'Ausente'
    case 'busy':
      return 'Ocupado'
    case 'offline':
      return 'Desconectado'
  }
}

/** Resume la actividad compartida (nunca rutas: solo nombres). */
function activityText(activity: PresenceActivity | undefined): string | null {
  if (!activity) return null
  const parts: string[] = []
  if (activity.project) parts.push(activity.file ? `${activity.project} · ${activity.file}` : activity.project)
  return parts.length > 0 ? parts.join('  ·  ') : null
}

/** Lista de amigos reales con presencia. Click → abre la conversación. */
export function FriendList({
  friends,
  activeId,
  unread,
  presence,
  onSelect
}: FriendListProps): JSX.Element {
  if (friends.length === 0) {
    return <p className={styles.empty}>Todavía no tienes amigos. Busca a alguien abajo.</p>
  }

  return (
    <div className={styles.list} role="listbox" aria-label="Amigos">
      {friends.map((friend) => {
        const label = friend.displayName ?? friend.handle ?? 'Usuario'
        const pending = unread?.[friend.id] ?? 0
        const presenceEntry = presence?.[friend.id]
        const status: PresenceStatus = presenceEntry?.status ?? 'offline'
        const activity = activityText(presenceEntry?.activity)
        const subtitle = status === 'online' ? activity ?? presenceLabel(status) : presenceLabel(status)
        return (
          <button
            key={friend.id}
            type="button"
            role="option"
            aria-selected={friend.id === activeId}
            className={[styles.row, friend.id === activeId ? styles.rowActive : null]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onSelect(friend)}
            title={friend.handle ? `@${friend.handle}` : label}
          >
            <span className={styles.avatarWrap}>
              <UserAvatar name={label} src={friend.avatarUrl ?? undefined} size={34} />
              <span
                className={[styles.dot, styles[status]].join(' ')}
                title={presenceLabel(status)}
              />
            </span>
            <span className={styles.main}>
              <span className={styles.name}>{label}</span>
              <span className={[styles.handle, activity && status === 'online' ? styles.activity : null]
                .filter(Boolean)
                .join(' ')}
              >
                {subtitle}
              </span>
            </span>
            {pending > 0 ? <span className={styles.badge}>{pending}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
