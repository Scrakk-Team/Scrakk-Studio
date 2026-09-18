import { useMemo, useState, type JSX } from 'react'
import styles from './UserAvatar.module.css'

interface UserAvatarProps {
  name: string
  /** Enlace de la imagen (la foto nunca se guarda, solo el enlace). */
  src?: string
  size?: number
  className?: string
}

/** Iniciales para el fallback (máx. 2 letras). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

/** Tono estable a partir del nombre (mismo usuario = mismo color siempre). */
function hueOf(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360
  return hash
}

/**
 * Avatar de usuario: foto por enlace con fallback a iniciales sobre un color
 * estable derivado del nombre. Si la imagen falla (sin red / URL rota) cae
 * solo al fallback, sin íconos rotos.
 */
export function UserAvatar({ name, src, size = 32, className }: UserAvatarProps): JSX.Element {
  const [failed, setFailed] = useState(false)
  const initials = useMemo(() => initialsOf(name), [name])
  const hue = useMemo(() => hueOf(name), [name])

  const showImage = Boolean(src) && !failed

  return (
    <span
      className={className ? `${styles.avatar} ${className}` : styles.avatar}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: `hsl(${hue} 42% 32%)`
      }}
      aria-hidden="true"
    >
      {showImage ? (
        <img className={styles.img} src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        <span className={styles.initials}>{initials}</span>
      )}
    </span>
  )
}
