import type { JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { UserAvatar } from '../UserAvatar/UserAvatar'
import styles from './ProfileView.module.css'

export interface ProfileViewData {
  name: string
  handle?: string | null
  avatarUrl?: string | null
  description?: string | null
  dni?: string
  presence?: string
  statusLabel?: string
  gender?: string | null
  customStatus?: string | null
  customStatusEmoji?: string | null
  customStatusExpiresAt?: string | null
  createdAt?: string | null
  project?: string | null
  file?: string | null
}

export interface ProfileViewConfig {
  /** Tamaño del avatar */
  avatarSize?: number
  /** Mostrar DNI */
  showDNI?: boolean
  /** Mostrar descripción */
  showDescription?: boolean
  /** Variante compacta (menos padding) */
  compact?: boolean
  /** Auto-resumir descripción si es larga */
  autoSummary?: boolean
  summaryLength?: number
}

interface ProfileViewProps {
  profile: ProfileViewData
  config?: ProfileViewConfig
}

/**
 * Vista de perfil reutilizable (presentacional) — la usan tanto el ProfileCard
 * (perfil propio) como el modal de perfil ajeno. Configurable vía `config`.
 */
export function ProfileView({ profile, config }: ProfileViewProps): JSX.Element {
  const {
    avatarSize = 56,
    showDNI = false,
    showDescription = true,
    compact = false,
    autoSummary = false,
    summaryLength = 80
  } = config ?? {}

  const description = profile.description
    ? autoSummary && profile.description.length > summaryLength
      ? profile.description.slice(0, summaryLength) + '…'
      : profile.description
    : null

  const isCustomActive =
    profile.customStatus &&
    (!profile.customStatusExpiresAt || new Date(profile.customStatusExpiresAt).getTime() > Date.now())

  const genderLabel =
    profile.gender === 'male'
      ? 'Hombre'
      : profile.gender === 'female'
        ? 'Mujer'
        : profile.gender === 'nonbinary'
          ? 'No binario'
          : profile.gender === 'other'
            ? 'Otro'
            : profile.gender

  const createdLabel = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    : null

  return (
    <div className={[styles.view, compact ? styles.compact : ''].filter(Boolean).join(' ')}>
      <div className={styles.head}>
        <span className={styles.avatarWrap}>
          <UserAvatar name={profile.name} src={profile.avatarUrl ?? undefined} size={avatarSize} />
          {profile.presence ? <span className={[styles.presenceDot, styles[profile.presence]].join(' ')} /> : null}
          {isCustomActive ? (
            <span className={styles.bubble}>
              <ProductIcon id="pencil" size={10} />
              <span className={styles.bubbleText}>{profile.customStatus}</span>
            </span>
          ) : null}
        </span>
      </div>
      <span className={styles.name}>{profile.name}</span>
      {(profile.handle || profile.gender) && (
        <div className={styles.subnameRow}>
          {profile.handle ? <span className={styles.handle}>{profile.handle}</span> : null}
          {profile.handle && profile.gender ? <span className={styles.dot}>·</span> : null}
          {profile.gender ? <span className={styles.gender}>{genderLabel}</span> : null}
        </div>
      )}
      {createdLabel ? <span className={styles.date}>Miembro desde {createdLabel}</span> : null}
      {showDescription && description ? <p className={styles.desc}>{description}</p> : null}
      {(profile.project || profile.file) ? (
        <div className={styles.activityRow}>
          {profile.project ? (
            <span className={styles.activityItem}>
              <ProductIcon id="folder" size={12} />
              {profile.project}
            </span>
          ) : null}
          {profile.file ? (
            <span className={styles.activityItem}>
              <ProductIcon id="file" size={12} />
              {profile.file}
            </span>
          ) : null}
        </div>
      ) : null}
      {showDNI && profile.dni ? (
        <div className={styles.dniRow}>
          <span className={styles.dniLabel}>DNI</span>
          <span className={styles.dni}>{profile.dni}</span>
        </div>
      ) : null}
    </div>
  )
}
