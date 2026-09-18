import { useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { IconButton, ToggleSwitch } from '@ui'
import type { MyProfile, PresenceActivity, PresenceStatus } from '../../state/types'
import { ProfileView } from '../ProfileView/ProfileView'
import styles from './ProfileCard.module.css'

interface ProfileCardProps {
  profile: MyProfile
  /** Nombre real del proyecto abierto (nunca la ruta). */
  projectName?: string
  /** Nombre real del archivo abierto (nunca la ruta). */
  fileName?: string
  onEdit: () => void
  onSignOut: () => void
  onChangePresence: (presence: PresenceStatus) => void
  onChangeActivity: (activity: PresenceActivity) => void
}

function presenceLabel(presence: PresenceStatus): string {
  switch (presence) {
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

const PRESENCE_OPTIONS: PresenceStatus[] = ['online', 'away', 'busy', 'offline']

/**
 * Perfil propio: identidad (foto, nombre, handle, descripción, DNI), estado de
 * presencia REAL (se publica al instante) y qué comparte (opt-in por campo).
 * Nada se comparte por defecto.
 */
export function ProfileCard({
  profile,
  projectName,
  fileName,
  onEdit,
  onSignOut,
  onChangePresence,
  onChangeActivity
}: ProfileCardProps): JSX.Element {
  const [copied, setCopied] = useState(false)

  // Un campo está "compartido" si tiene valor en activity (el provider lo
  // reemplaza por el nombre real al publicar).
  const sharing = {
    project: Boolean(profile.activity.project),
    file: Boolean(profile.activity.file)
  }

  const toggleShare = (key: 'project' | 'file', enabled: boolean): void => {
    const next: PresenceActivity = { ...profile.activity }
    if (enabled) next[key] = 'on'
    else delete next[key]
    onChangeActivity(next)
  }

  const copyDni = (): void => {
    void navigator.clipboard?.writeText(profile.dni)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const fields: Array<{ key: 'project' | 'file'; label: string; value?: string }> = [
    { key: 'project', label: 'Qué proyecto estoy usando', value: projectName },
    { key: 'file', label: 'Archivo abierto', value: fileName }
  ]

  return (
    <div className={styles.card}>
      <ProfileView
        profile={{
          name: profile.name,
          handle: profile.handle,
          avatarUrl: profile.avatarUrl,
          description: profile.description,
          presence: profile.presence,
          statusLabel: presenceLabel(profile.presence)
        }}
        config={{ avatarSize: 56, showDescription: true, autoSummary: false }}
      />

      <div className={styles.dniRow}>
        <span className={styles.dniLabel}>DNI</span>
        <span className={styles.dni}>{profile.dni}</span>
        <IconButton label={copied ? 'Copiado' : 'Copiar DNI'} size="sm" shape="rounded" onClick={copyDni}>
          <ProductIcon id={copied ? 'check' : 'copy'} size={13} />
        </IconButton>
      </div>

      <div className={styles.block}>
        <span className={styles.blockTitle}>Estado</span>
        <div className={styles.presenceRow}>
          {PRESENCE_OPTIONS.map((presence) => (
            <button
              key={presence}
              type="button"
              className={[styles.presenceBtn, profile.presence === presence ? styles.presenceActive : null]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onChangePresence(presence)}
            >
              <span className={[styles.presenceDot, styles[presence]].join(' ')} />
              {presenceLabel(presence)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.block}>
        <span className={styles.blockTitle}>Qué comparto</span>
        <div className={styles.toggles}>
          {fields.map((field) => (
            <div key={field.key} className={styles.toggleRow}>
              <span className={styles.toggleInfo}>
                <span className={styles.toggleLabel}>{field.label}</span>
                {sharing[field.key] ? (
                  <span className={styles.toggleValue}>{field.value ?? 'sin datos todavía'}</span>
                ) : null}
              </span>
              <ToggleSwitch
                checked={sharing[field.key]}
                onChange={(next) => toggleShare(field.key, next)}
                label={field.label}
              />
            </div>
          ))}
        </div>
        <p className={styles.note}>Nunca se comparten rutas reales: solo nombres visibles.</p>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.actionBtn} onClick={onEdit}>
          <ProductIcon id="pencil" size={13} />
          Editar perfil
        </button>
        <button type="button" className={styles.actionBtn} onClick={onSignOut}>
          <ProductIcon id="close" size={13} />
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
