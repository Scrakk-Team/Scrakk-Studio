import type { JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { IconButton } from '@ui'
import { showModal } from '@services/modals'
import type { Friend, PresenceStatus } from '@shared/social'
import { UserAvatar } from '../UserAvatar/UserAvatar'
import { ProfileView } from '../ProfileView/ProfileView'
import styles from './ChatHeader.module.css'

interface ChatHeaderProps {
  peer: Friend
  /** Estado real del amigo (presencia). */
  status?: PresenceStatus
  onBack: () => void
}

function statusLabel(status: PresenceStatus): string {
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

/** Cabecera del chat directo: compacta, sin quitar amigo, clickeable para ver perfil. */
export function ChatHeader({ peer, status, onBack }: ChatHeaderProps): JSX.Element {
  const label = peer.displayName ?? peer.handle ?? 'Usuario'
  const sub = status ? statusLabel(status) : peer.handle ? `@${peer.handle}` : ''
  const openProfile = (): void => {
    const p = peer as unknown as {
      bio?: string | null
      gender?: string | null
      customStatus?: string | null
      customStatusExpiresAt?: string | null
      createdAt?: string | null
    }
    showModal({
      title: label,
      size: 'sm',
      render: () => (
        <ProfileView
          profile={{
            name: label,
            handle: peer.handle ? `@${peer.handle}` : undefined,
            avatarUrl: peer.avatarUrl,
            description: p.bio ?? null,
            presence: status,
            statusLabel: status ? statusLabel(status) : undefined,
            gender: p.gender ?? null,
            customStatus: p.customStatus ?? null,
            customStatusExpiresAt: p.customStatusExpiresAt ?? null,
            createdAt: p.createdAt ?? null
          }}
          config={{ avatarSize: 64, showDescription: true }}
        />
      )
    })
  }
  return (
    <div className={styles.header}>
      <IconButton label="Volver" size="sm" shape="rounded" onClick={onBack}>
        <ProductIcon id="chevron-right" size={15} style={{ transform: 'rotate(180deg)' }} />
      </IconButton>

      <button type="button" className={styles.profileBtn} onClick={openProfile} aria-label={`Ver perfil de ${label}`}>
        <span className={styles.avatarWrap}>
          <UserAvatar name={label} src={peer.avatarUrl ?? undefined} size={30} />
          {status ? <span className={[styles.dot, styles[status]].join(' ')} /> : null}
        </span>
        <span className={styles.main}>
          <span className={styles.name}>{label}</span>
          {sub ? <span className={styles.sub}>{sub}</span> : null}
        </span>
      </button>
    </div>
  )
}
