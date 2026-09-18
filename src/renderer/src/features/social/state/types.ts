/**
 * Tipos de UI del panel Social.
 *
 * Amigos/mensajes/presencia reales vienen de `@shared/social` (servicio IPC).
 * Acá quedan el perfil propio y la vista.
 */

import type { PresenceActivity, PresenceStatus } from '@shared/social'

export type { PresenceActivity, PresenceStatus }

/** Tu perfil (identidad + presencia propia). DNI = `auth.users.id`. */
export interface MyProfile {
  dni: string
  name: string
  handle: string
  avatarUrl?: string
  description?: string
  presence: PresenceStatus
  /** Qué comparte (opt-in): project/file. */
  activity: PresenceActivity
  gender?: string | null
  customStatus?: string | null
  customStatusEmoji?: string | null
  customStatusExpiresAt?: string | null
  createdAt?: string | null
}

/** Vista activa dentro del panel Social. */
export type SocialView = 'home' | 'chat' | 'profile' | 'accounts' | 'addAccount'
