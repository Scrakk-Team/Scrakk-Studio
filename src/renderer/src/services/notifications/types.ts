/**
 * Sistema de notificaciones — tipos.
 *
 * Una notificación es efímera (vive en memoria, no se persiste). La API
 * permite: 4 esquinas, hasta 3 botones con callbacks arbitrarios e imagen
 * opcional (clamp 500×500, esquinas redondeadas configurables).
 *
 * El registry además guarda un historial acotado (las ya cerradas) para el
 * panel de historial.
 */

export type NotificationCorner = 'tl' | 'tr' | 'bl' | 'br'
export type NotificationSeverity = 'info' | 'success' | 'warn' | 'error'

export interface NotificationButton {
  label: string
  /** Callback arbitrario del lado que registra la notificación. */
  run: () => void
}

/** Imagen opcional dentro de la notificación (máx 500×500 px render). */
export interface NotificationImage {
  /** URL absoluta, data-URL o ruta servida por el renderer. */
  src: string
  /** Ancho deseado (px, clamp a 500). Default: ancho natural/clamp. */
  width?: number
  height?: number
  rounded?: boolean
}

export interface AppNotification {
  id: string
  title: string
  message?: string
  /** Texto secundario largo (el `detail` de `MessageOptions` de VS Code). */
  detail?: string
  severity: NotificationSeverity
  corner: NotificationCorner
  /** Auto-dismiss en ms; 0/undefined = persistente (requiere cerrar). */
  timeoutMs?: number
  /** Máximo 3 botones. */
  actions?: NotificationButton[]
  image?: NotificationImage
  /** Epoch ms de creación (lo pone el registry; para ordenar el historial). */
  createdAt?: number
}

/** Entrada del historial: snapshot al momento de cerrarse. */
export interface NotificationHistoryEntry extends AppNotification {
  dismissedAt: number
}

export type NotificationsListener = () => void
