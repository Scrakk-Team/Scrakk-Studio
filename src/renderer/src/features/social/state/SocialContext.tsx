// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode
} from 'react'
import { account as accountService } from '@services/account'
import { social } from '@services/social'
import { notify } from '@services/notifications'
import { setActivityBadge, clearActivityBadge } from '@features/activitybar/badges'
import { getEditorFiles, subscribeToEditorFiles } from '@features/editor/editorBus'
import type { AccountList, AccountProfile } from '@shared/account'
import type { LegalConsent } from '@shared/legal'
import type {
  DirectMessage,
  Friend,
  FriendRequest,
  ImageUpload,
  PresenceActivity,
  PresenceStatus,
  SocialUser,
  UserPresence
} from '@shared/social'
import { SOCIAL_RULES } from '@shared/social'
import type { MyProfile, SocialView } from './types'
import { sameFriends, samePresenceMap, sameRequests } from './equality'

import { t } from '@core/i18n'
import { setActiveSocialSession } from '../actions/shareFile'
/** Frases del slowmode (estilo Discord), en español neutro. */
const SLOWMODE_MESSAGES = [
  t('social.tranquilo.se.te.va.a'),
  t('social.mas.despacio.campeon'),
  t('social.respira.el.teclado.no.corre'),
  t('social.ehh.muy.rapido.espera.un'),
  t('social.slowmode.deja.que.el.server'),
  t('social.todo.bien.con.el.teclado'),
  t('social.un.mensaje.a.la.vez'),
  t('social.baja.un.cambio')
]

/** Clave donde la app guarda la raíz del workspace (misma que breadcrumbs). */
const WORKSPACE_ROOT_KEY = 'scrakk-studio:root-path'
/** Presencia sin latido por más de esto ⇒ offline. */
const PRESENCE_TTL_MS = 120_000
/** Cada cuánto late mi presencia. */
const HEARTBEAT_MS = 45_000

/** Último segmento de una ruta (nunca mandamos rutas completas). */
function baseName(p: string): string {
  const norm = p.replace(/[\\/]+$/, '')
  const idx = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'))
  return idx >= 0 ? norm.slice(idx + 1) : norm
}

function readWorkspaceRoot(): string | null {
  try {
    return localStorage.getItem(WORKSPACE_ROOT_KEY)
  } catch {
    return null
  }
}

/** Estado efectivo: si no hay fila o el latido venció, offline. */
function effectiveStatus(presence: UserPresence | undefined): PresenceStatus {
  if (!presence) return 'offline'
  if (presence.status === 'offline') return 'offline'
  return Date.now() - new Date(presence.updatedAt).getTime() > PRESENCE_TTL_MS
    ? 'offline'
    : presence.status
}

function shouldNotify(status: PresenceStatus): boolean {
  switch (status) {
    case 'busy':
      return false
    case 'offline':
      return true
    case 'away':
      return true
    case 'online':
      return true
    default:
      return true
  }
}

export interface CreateProfileInput {
  name: string
  handle: string
  description?: string
  avatarUrl?: string
  gender?: string | null
  customStatus?: string | null
  customStatusEmoji?: string | null
  customStatusDuration?: string | null
}

/** Resultado de una acción de cuenta. */
export interface AccountActionResult {
  ok: boolean
  error?: string
}

interface SocialContextValue {
  /** Cuenta que usa ESTE panel (cada panel puede tener la suya). */
  accountId: string | null
  /** Perfil propio. null = sin sesión (onboarding). */
  me: MyProfile | null
  /** true = hay sesión pero falta completar el perfil público. */
  needsProfile: boolean

  friends: Friend[]
  requests: FriendRequest[]
  /** Cuentas guardadas (multi-cuenta). */
  accounts: AccountList
  /** Resumen de la cuenta activa de ESTE panel (para mostrar/verificar). */
  activeAccount: AccountList['accounts'][number] | null
  /** Amigo con la conversación abierta. */
  activePeer: Friend | null
  /** Mensajes de la conversación activa. */
  messages: DirectMessage[]
  /** No leídos por amigo (id → cantidad). */
  unread: Record<string, number>
  /** Presencia efectiva por amigo (id → estado + actividad). */
  friendsPresence: Record<string, { status: PresenceStatus; activity: PresenceActivity }>
  /** Nombres reales del IDE para la actividad (proyecto/archivo). */
  ideContext: { project?: string; file?: string }
  /** Mensaje al que se está respondiendo */
  replyTo: DirectMessage | null
  /** Typing indicator por peer */
  typingByPeer: Record<string, boolean>
  hasMore: boolean
  loadingMore: boolean

  /** false mientras se resuelve la cuenta: el panel muestra un placeholder. */
  ready: boolean

  view: SocialView

  requestCode: (email: string) => Promise<AccountActionResult>
  verifyCode: (
    email: string,
    code: string,
    consent?: LegalConsent
  ) => Promise<AccountActionResult>
  updateProfile: (patch: Partial<CreateProfileInput>) => Promise<AccountActionResult>
  updateActivity: (activity: PresenceActivity) => void
  setPresence: (presence: PresenceStatus) => void
  /** Quita la cuenta activa de ESTE panel. */
  signOut: () => Promise<void>

  setView: (view: SocialView) => void
  refresh: () => Promise<void>

  /** Cambia la cuenta de ESTE panel (no afecta a los demás paneles). */
  switchAccount: (accountId: string) => void
  /** Elimina una cuenta guardada (global). */
  removeAccount: (accountId: string) => Promise<AccountActionResult>
  /** Abre el flujo para sumar otra cuenta. */
  addAccount: () => void

  searchUsers: (query: string) => Promise<SocialUser[]>
  sendRequest: (target: string) => Promise<AccountActionResult & { status?: string }>
  respondRequest: (requestId: string, accept: boolean) => Promise<AccountActionResult>
  removeFriend: (otherId: string) => Promise<AccountActionResult>

  openChat: (friend: Friend) => Promise<void>
  closeChat: () => void
  sendMessage: (body: string, attachments?: ImageUpload[]) => Promise<AccountActionResult>
  editMessage: (messageId: string, body: string) => Promise<AccountActionResult>
  deleteMessage: (messageId: string) => Promise<AccountActionResult>
  setReplyTo: (message: DirectMessage | null) => void
  sendTyping: (typing: boolean) => void
  loadMore: () => Promise<void>
}

const SocialContext = createContext<SocialContextValue | null>(null)

/** Perfil de cuenta (backend) → modelo de UI. DNI = `auth.users.id`. */
function toMyProfile(account: AccountProfile): MyProfile {
  const fallback = account.email.split('@')[0] || t('social.usuario')
  return {
    dni: account.id,
    name: account.displayName?.trim() || fallback,
    handle: account.handle ? `@${account.handle.replace(/^@/, '')}` : '',
    verified: account.verified,
    description: account.bio ?? undefined,
    avatarUrl: account.avatarUrl ?? undefined,
    presence: 'online',
    activity: {},
    gender: account.gender ?? null,
    customStatus: account.customStatus ?? null,
    customStatusEmoji: account.customStatusEmoji ?? null,
    customStatusExpiresAt: account.customStatusExpiresAt ?? null,
    createdAt: account.createdAt ?? null
  }
}

/**
 * Estado del panel Social, POR PANEL: cada instancia elige su cuenta y no
 * afecta a las demás. Perfil/amigos/mensajes son reales (RLS + Realtime), todo
 * vía IPC.
 */
export function SocialProvider({
  children,
  initialAccountId
}: {
  children: ReactNode
  initialAccountId?: string | null
}): JSX.Element {
  const [accountId, setAccountId] = useState<string | null>(initialAccountId ?? null)
  const [account, setAccount] = useState<AccountProfile | null>(null)
  const [accounts, setAccounts] = useState<AccountList>({ activeId: null, accounts: [] })
  const [friends, setFriends] = useState<Friend[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [activePeer, setActivePeer] = useState<Friend | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [presenceMap, setPresenceMap] = useState<Record<string, UserPresence>>({})
  const [ideContext, setIdeContext] = useState<{ project?: string; file?: string }>({})
  const [view, setViewState] = useState<SocialView>('home')
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null)
  const [typingByPeer, setTypingByPeer] = useState<Record<string, boolean>>({})
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  /**
   * ¿Ya sabemos si hay sesión o no?
   *
   * Sin esto el panel pintaba el LOGIN mientras resolvía la cuenta (el `me` es
   * `null` tanto en "no hay sesión" como en "todavía no cargó"), así que al
   * abrir el panel se veía el login por unos segundos y después los amigos.
   */
  const [ready, setReady] = useState(false)

  const [activityOverride, setActivityOverride] = useState<PresenceActivity | null>(null)
  const [presenceOverride, setPresenceOverride] = useState<PresenceStatus | null>(null)

  // Refs para handlers/efectos sin re-suscribir.
  const accountIdRef = useRef<string | null>(accountId)
  accountIdRef.current = accountId
  const activePeerRef = useRef<Friend | null>(activePeer)
  activePeerRef.current = activePeer
  const reloadRef = useRef<() => void>(() => {})
  // Refs "latest" para los handlers de Realtime: Allows que el efecto de
  // suscripción NO dependa de `account`/`friends` y se enganche UNA vez. Antes
  // `friends` cambiaba de identidad en cada poll (15s) y eso desenganchaba y
  // reenganchaba los 7 canales, con una ventana ciega donde se perdían eventos.
  const accountRef = useRef<AccountProfile | null>(account)
  accountRef.current = account
  const friendsRef = useRef<Friend[]>(friends)
  friendsRef.current = friends

  // Publica la conversación activa para la acción global "Compartir en Social"
  // (el menú contextual del Explorer y de las tabs vive fuera de este panel).
  useEffect(() => {
    setActiveSocialSession(
      accountId && activePeer
        ? {
            accountId,
            peerId: activePeer.id,
            peerName: activePeer.displayName ?? activePeer.handle ?? ''
          }
        : null
    )
  }, [accountId, activePeer])

  // Slowmode (como Discord): ventana deslizante de envíos por sesión.
  const sendTimesRef = useRef<number[]>([])
  const slowmodeMessage = useCallback((): string | null => {
    const windowMs = SOCIAL_RULES.slowmode.windowMs
    const now = Date.now()
    sendTimesRef.current = sendTimesRef.current.filter((at) => now - at < windowMs)
    if (sendTimesRef.current.length < SOCIAL_RULES.slowmode.max) return null
    return SLOWMODE_MESSAGES[Math.floor(Math.random() * SLOWMODE_MESSAGES.length)]
  }, [])

  const me = useMemo(() => {
    if (!account) return null
    const base = toMyProfile(account)
    return {
      ...base,
      presence: presenceOverride ?? base.presence,
      activity: activityOverride ?? base.activity
    }
  }, [account, presenceOverride, activityOverride])
  const needsProfile = account !== null && !account.displayName
  const activeAccount = useMemo(
    () => accounts.accounts.find((entry) => entry.id === accountId) ?? null,
    [accounts, accountId]
  )

  // Actividad REAL a compartir (según los toggles del perfil).
  const sharedActivity = useMemo<PresenceActivity>(() => {
    if (!me) return {}
    const out: PresenceActivity = {}
    if (me.activity.project && ideContext.project) out.project = ideContext.project
    if (me.activity.file && ideContext.file) out.file = ideContext.file
    return out
  }, [me, ideContext])
  const status = me?.presence ?? 'online'
  const statusRef = useRef<PresenceStatus>(status)
  statusRef.current = status
  const activityRef = useRef<PresenceActivity>(sharedActivity)
  activityRef.current = sharedActivity

  // Presencia efectiva de cada amigo (con staleness → offline).
  const friendsPresence = useMemo(() => {
    const out: Record<string, { status: PresenceStatus; activity: PresenceActivity }> = {}
    for (const friend of friends) {
      const entry = presenceMap[friend.id]
      out[friend.id] = { status: effectiveStatus(entry), activity: entry?.activity ?? {} }
    }
    return out
  }, [friends, presenceMap])

  // Badge del ícono Social: no leídos + solicitudes entrantes. Cada panel
  // aporta lo suyo y el store los suma (multi-cuenta).
  const badgeSourceId = useRef(`social-${Math.random().toString(36).slice(2)}`).current
  const unreadTotal = useMemo(
    () =>
      Object.values(unread).reduce((sum, count) => sum + count, 0) +
      requests.filter((request) => request.direction === 'incoming').length,
    [unread, requests]
  )
  useEffect(() => {
    setActivityBadge('social', badgeSourceId, unreadTotal)
    return () => clearActivityBadge('social', badgeSourceId)
  }, [unreadTotal, badgeSourceId])

  const loadAccounts = useCallback(async (): Promise<AccountList | null> => {
    const result = await accountService.listAccounts()
    if (!result.ok) return null
    setAccounts(result.data)
    return result.data
  }, [])

  const loadPresence = useCallback(async (id: string): Promise<void> => {
    const result = await social.getPresence(id)
    if (!result.ok || accountIdRef.current !== id) return
    const map: Record<string, UserPresence> = {}
    for (const entry of result.data) map[entry.userId] = entry
    // Igual que en `loadSocial`: si no cambió nada, se conserva la identidad
    // para no invalidar los `memo` del panel.
    setPresenceMap((prev) => (samePresenceMap(prev, map) ? prev : map))
  }, [])

  const loadSocial = useCallback(async (id: string): Promise<void> => {
    const [friendsResult, requestsResult] = await Promise.all([
      social.listFriends(id),
      social.listRequests(id)
    ])
    if (accountIdRef.current !== id) return
    // Sólo se reemplaza si el CONTENIDO cambió. Antes, cada poll (15s) ponía un
    // array nuevo: eso invalidaba el `memo` del panel, de la lista de mensajes
    // y de cada bubble, y además re-suscribía los canales de Realtime.
    if (friendsResult.ok) setFriends((prev) => (sameFriends(prev, friendsResult.data) ? prev : friendsResult.data))
    if (requestsResult.ok) setRequests((prev) => (sameRequests(prev, requestsResult.data) ? prev : requestsResult.data))
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    if (!accountId) return
    await Promise.all([loadSocial(accountId), loadPresence(accountId)])
  }, [accountId, loadSocial, loadPresence])

  // Las notificaciones de Realtime (presencia, amigos, solicitudes) pueden
  // llegar en ráfaga (la tabla `presence` late por cada usuario). Se agrupan
  // en un solo refresh para no re-renderizar en cadena (el panel "parpadeaba").
  const refreshTimerRef = useRef<number | null>(null)
  const scheduleRefresh = useCallback((): void => {
    if (refreshTimerRef.current !== null) return
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null
      void refresh()
    }, 800)
  }, [refresh])
  reloadRef.current = scheduleRefresh
  useEffect(
    () => () => {
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
    },
    []
  )

  // Contexto del IDE para la actividad compartida (solo NOMBRES, nunca rutas).
  useEffect(() => {
    const read = (): void => {
      const root = readWorkspaceRoot()
      const active = getEditorFiles().activePath
      const project = root ? baseName(root) : undefined
      const file = active ? baseName(active) : undefined
      // Identidad estable: `subscribeToEditorFiles` emite en cada cambio de
      // archivo y `workspace-changed` en cada workspace. Antes se ponía un
      // objeto nuevo siempre → re-render del panel entero + republicar
      // presencia, aunque los valores fueran los mismos.
      setIdeContext((prev) =>
        prev.project === project && prev.file === file ? prev : { project, file }
      )
    }
    read()
    const unsubscribe = subscribeToEditorFiles(read)
    window.addEventListener('workspace-changed', read)
    return () => {
      unsubscribe()
      window.removeEventListener('workspace-changed', read)
    }
  }, [])

  // Al montar: elegir cuenta (la default o la primera) y abrir su Realtime.
  useEffect(() => {
    let alive = true
    void (async () => {
      const list = await loadAccounts()
      if (!alive) return
      const next = list?.activeId ?? list?.accounts[0]?.id ?? null
      if (!next) {
        // No hay cuentas guardadas: el login es el estado CORRECTO, no una
        // espera. Se marca listo para que el panel no muestre un placeholder.
        setAccountId(null)
        setReady(true)
        return
      }
      setAccountId((current) => current ?? next)
    })()
    return () => {
      alive = false
    }
  }, [loadAccounts])

  // Cambió la cuenta de este panel: cargar perfil + social + Realtime.
  useEffect(() => {
    setActivePeer(null)
    setMessages([])
    setUnread({})
    if (!accountId) {
      setAccount(null)
      setFriends([])
      setRequests([])
      return
    }
    let alive = true
    void (async () => {
      try {
        const result = await accountService.current(accountId)
        if (!alive) return
        if (import.meta.env.DEV) {
          console.log('[social] cuenta', accountId, '→', result.ok ? (result.data?.email ?? 'null') : `error: ${result.error}`)
        }
        setAccount(result.ok ? result.data : null)
      } catch (error) {
        if (import.meta.env.DEV) console.log('[social] cuenta', accountId, '→ throw', error)
        if (alive) setAccount(null)
      } finally {
        // Pase lo que pase, ya sabemos si hay sesión: se sale del placeholder.
        if (alive) setReady(true)
      }
    })()
    void social.watch(accountId).then((result) => {
      if (import.meta.env.DEV) {
        console.log('[social] watch', accountId, result.ok ? 'ok' : `error: ${result.error}`)
      }
    })
    void loadSocial(accountId)
    void loadPresence(accountId)
    return () => {
      alive = false
    }
  }, [accountId, loadSocial, loadPresence])

  // Eventos de Realtime: solo los de ESTA cuenta.
  useEffect(() => {
    const unsubMessage = social.onIncomingMessage(({ accountId: acc, message }) => {
      if (acc !== accountIdRef.current) return
      // Notificación según estado
      const myStatus = statusRef.current
      const isOwn = message.senderId === acc
      const isViewing = activePeerRef.current?.id === message.senderId
      if (!isOwn && !isViewing && shouldNotify(myStatus)) {
        // Check mention: if body contains @myHandle, highlight
        const myHandle = accountRef.current?.handle ?? ''
        const isMention = myHandle && message.body.toLowerCase().includes(`@${myHandle.toLowerCase()}`)
        const sender = friendsRef.current.find((f) => f.id === message.senderId)
        const senderName = sender?.displayName ?? sender?.handle ?? t('social.alguien')
        notify({
          title: isMention ? `${senderName} te mencionó` : `Mensaje de ${senderName}`,
          // Un mensaje que sólo lleva adjuntos no tiene texto: el aviso salía vacío.
          message:
            message.body.trim().slice(0, 120) ||
            (message.attachments?.length ? t('social.imagen.adjunta') : ''),
          severity: isMention ? 'info' : 'info',
          timeoutMs: 4000
        })
      }
      if (activePeerRef.current && message.senderId === activePeerRef.current.id) {
        setMessages((prev) => [...prev, message])
        void social.markRead(acc, message.senderId)
      } else if (!isOwn) {
        // Chat cerrado: acumular no leídos (badge en la lista de amigos).
        setUnread((prev) => ({ ...prev, [message.senderId]: (prev[message.senderId] ?? 0) + 1 }))
      }
    })
    const unsubUpdated = social.onMessageUpdated(({ accountId: acc, message }) => {
      if (acc !== accountIdRef.current) return
      setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)))
    })
    const unsubDeleted = social.onMessageDeleted(({ accountId: acc, messageId }) => {
      if (acc !== accountIdRef.current) return
      setMessages((prev) => prev.filter((m) => m.id !== messageId))
    })
    const unsubTyping = social.onTypingChanged(({ accountId: acc, userId, typing }) => {
      if (acc !== accountIdRef.current) return
      if (userId === acc) return
      setTypingByPeer((prev) => {
        if (typing) return { ...prev, [userId]: true }
        const next = { ...prev }
        delete next[userId]
        return next
      })
      if (typing) {
        // Auto-expire after 3s
        setTimeout(() => {
          setTypingByPeer((prev) => {
            if (!prev[userId]) return prev
            const next = { ...prev }
            delete next[userId]
            return next
          })
        }, 3000)
      }
    })
    const unsubRequests = social.onRequestsChanged(({ accountId: acc }) => {
      if (acc === accountIdRef.current) reloadRef.current()
    })
    const unsubFriends = social.onFriendsChanged(({ accountId: acc }) => {
      if (acc === accountIdRef.current) reloadRef.current()
    })
    const unsubPresence = social.onPresenceChanged(({ accountId: acc, presence }) => {
      if (acc !== accountIdRef.current) return
      // Mi propio latido vuelve por el mismo canal (yo también cumplo la
      // política de "amigos"). Mi estado local ya es la fuente de verdad, así
      // que ignorarlo evita un re-render del panel cada 45s.
      if (presence.userId === accountIdRef.current) return
      // Quirúrgico: la fila viene en el evento, así que NO se refetchea nada.
      // Antes llamaba a `reloadRef.current()` → 3 queries (amigos + solicitudes +
      // presencia) y un re-render del panel entero por CADA latido de CADA
      // amigo: con 20 amigos en línea, un refresh cada ~2s.
      setPresenceMap((prev) => {
        const existing = prev[presence.userId]
        // Mismo estado y misma actividad → no hay nada que pintar.
        if (
          existing &&
          existing.status === presence.status &&
          JSON.stringify(existing.activity) === JSON.stringify(presence.activity)
        ) {
          return prev
        }
        return { ...prev, [presence.userId]: presence }
      })
    })
    return () => {
      unsubMessage()
      unsubUpdated()
      unsubDeleted()
      unsubTyping()
      unsubRequests()
      unsubFriends()
      unsubPresence()
    }
    // Sin dependencias: los handlers leen SIEMPRE lo fresco por ref (arriba).
  }, [])

  // Publicar mi estado/actividad cuando cambian (y SOLO si cambian de verdad).
  //
  // `sharedActivity` se rehace en cada `ideContext`, y `ideContext` se rehace en
  // cada cambio del editor: abrir/cambiar de archivo publicaba presencia sin que
  // el contenido fuera distinto → una escritura + un evento Realtime para todos
  // los amigos, por cada archivo que tocabas. El heartbeat de abajo sigue
  // refrescando `updated_at`, que es lo que mantiene el "online".
  const lastPresencePublishRef = useRef('')
  useEffect(() => {
    if (!accountId || !me) return
    const signature = JSON.stringify([status, sharedActivity])
    if (lastPresencePublishRef.current === signature) return
    lastPresencePublishRef.current = signature
    void social.setPresence(accountId, status, sharedActivity)
  }, [accountId, me, status, sharedActivity])

  // Latido de presencia por cuenta (sin poner offline al desmontar: varias cuentas pueden estar online a la vez)
  useEffect(() => {
    if (!accountId) return undefined
    const timer = setInterval(() => {
      void social.setPresence(accountId, statusRef.current, activityRef.current)
    }, HEARTBEAT_MS)
    return () => {
      clearInterval(timer)
    }
  }, [accountId])

  // Watchdog de Realtime: re-asegura el canal (idempotente si ya está OK).
  useEffect(() => {
    if (!accountId) return undefined
    const timer = setInterval(() => void social.watch(accountId), 30_000)
    return () => clearInterval(timer)
  }, [accountId])

  // Red de seguridad: refresca presencia (60s) y amigos/solicitudes (120s) por si
  // el push de Realtime fallara. Estaban en 10s/15s, que era un refetch por
  // minuto CON el Realtime funcionando (que ya notifica cada cambio).
  // `loadSocial`/`loadPresence` no cambian la identidad si nada cambió, así que
  // con todo sano estos timers no renderizan nada.
  useEffect(() => {
    if (!accountId) return undefined
    const presenceTimer = setInterval(() => void loadPresence(accountId), 60_000)
    const socialTimer = setInterval(() => void loadSocial(accountId), 120_000)
    return () => {
      clearInterval(presenceTimer)
      clearInterval(socialTimer)
    }
  }, [accountId, loadPresence, loadSocial])

  // Red de seguridad: mientras un chat está abierto, refresca cada 20s y mergea
  // los mensajes nuevos (dedupe por id).
  //
  // Estaba en 3s, y cada pasada son hasta 3 round-trips secuenciales (mensajes →
  // reply previews → adjuntos, ver `listMessages` en el main) + un O(n) sobre
  // todo el historial cargado. El canal de Realtime ya cubre INSERT, UPDATE y
  // DELETE de `messages`, así que 20s es una red real (cubre un push perdido)
  // sin pagar el peaje 6 veces por minuto.
  useEffect(() => {
    if (view !== 'chat' || !activePeer || !accountId) return undefined
    const peerId = activePeer.id
    let cancelled = false
    const timer = setInterval(() => {
      void social.listMessages(accountId, peerId).then((result) => {
        if (cancelled || !result.ok) return
        setMessages((prev) => {
          const seen = new Set(prev.map((message) => message.id))
          const merged = [...prev]
          for (const message of result.data) if (!seen.has(message.id)) merged.push(message)
          if (merged.length === prev.length) return prev
          merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          return merged
        })
      })
    }, 20_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [view, activePeer, accountId])

  const requestCode = useCallback(async (email: string): Promise<AccountActionResult> => {
    const result = await accountService.requestCode({ email })
    return result.ok ? { ok: true } : { ok: false, error: result.error }
  }, [])

  const verifyCode = useCallback(
    async (
      email: string,
      code: string,
      consent?: LegalConsent
    ): Promise<AccountActionResult> => {
      const result = await accountService.verifyCode({ email, code, consent })
      if (!result.ok) return { ok: false, error: result.error }
      await loadAccounts()
      // Este panel pasa a la cuenta recién creada.
      setAccountId(result.data.id)
      setViewState('home')
      return { ok: true }
    },
    [loadAccounts]
  )

  const updateProfile = useCallback(
    async (patch: Partial<CreateProfileInput>): Promise<AccountActionResult> => {
      if (!accountId) return { ok: false, error: t('social.sin.cuenta') }
      const result = await accountService.update(accountId, {
        displayName: patch.name,
        handle: patch.handle,
        avatarUrl: patch.avatarUrl,
        bio: patch.description,
        gender: patch.gender,
        customStatus: patch.customStatus,
        customStatusEmoji: patch.customStatusEmoji,
        customStatusExpiresAt: patch.customStatusDuration
      })
      if (!result.ok) return { ok: false, error: result.error }
      setAccount(result.data)
      return { ok: true }
    },
    [accountId]
  )

  const updateActivity = useCallback((activity: PresenceActivity): void => {
    setActivityOverride(activity)
  }, [])

  const setPresence = useCallback((presence: PresenceStatus): void => {
    setPresenceOverride(presence)
  }, [])

  const signOut = useCallback(async (): Promise<void> => {
    if (!accountId) return
    await accountService.removeAccount(accountId)
    const list = await loadAccounts()
    setAccountId(list?.activeId ?? list?.accounts[0]?.id ?? null)
    setViewState('home')
  }, [accountId, loadAccounts])

  const setView = useCallback((next: SocialView): void => {
    setViewState(next)
  }, [])

  const switchAccount = useCallback((id: string): void => {
    if (import.meta.env.DEV) {
      console.log('[social] switch →', id, '(actual', accountIdRef.current, ')')
    }
    setAccountId(id)
    setViewState('home')
    // Persistir la elección: si el panel se remonta (cambio de pestaña),
    // vuelve a esta cuenta en vez de la default.
    void accountService.setDefault(id).then((result) => {
      if (result.ok) setAccounts(result.data)
    })
  }, [])

  const removeAccount = useCallback(
    async (id: string): Promise<AccountActionResult> => {
      const result = await accountService.removeAccount(id)
      if (!result.ok) return { ok: false, error: result.error }
      setAccounts(result.data)
      // Si borré la cuenta de este panel, salto a otra (o a onboarding).
      if (accountIdRef.current === id) {
        setAccountId(result.data.activeId ?? result.data.accounts[0]?.id ?? null)
      }
      return { ok: true }
    },
    []
  )

  const addAccount = useCallback((): void => {
    setViewState('addAccount')
  }, [])

  const searchUsers = useCallback(
    async (query: string): Promise<SocialUser[]> => {
      if (!accountId) return []
      const result = await social.searchUsers(accountId, query)
      return result.ok ? result.data : []
    },
    [accountId]
  )

  const sendRequest = useCallback(
    async (target: string): Promise<AccountActionResult & { status?: string }> => {
      if (!accountId) return { ok: false, error: t('social.sin.cuenta') }
      const result = await social.sendRequest(accountId, target)
      if (!result.ok) return { ok: false, error: result.error }
      await refresh()
      return { ok: true, status: result.data }
    },
    [accountId, refresh]
  )

  const respondRequest = useCallback(
    async (requestId: string, accept: boolean): Promise<AccountActionResult> => {
      if (!accountId) return { ok: false, error: t('social.sin.cuenta') }
      const result = await social.respondRequest(accountId, requestId, accept)
      if (!result.ok) return { ok: false, error: result.error }
      await refresh()
      return { ok: true }
    },
    [accountId, refresh]
  )

  const removeFriend = useCallback(
    async (otherId: string): Promise<AccountActionResult> => {
      if (!accountId) return { ok: false, error: t('social.sin.cuenta') }
      const result = await social.removeFriend(accountId, otherId)
      if (!result.ok) return { ok: false, error: result.error }
      await refresh()
      return { ok: true }
    },
    [accountId, refresh]
  )

  const openChatSeq = useRef(0)

  const openChat = useCallback(
    async (friend: Friend): Promise<void> => {
      const seq = ++openChatSeq.current
      setActivePeer(friend)
      setViewState('chat')
      setHasMore(true)
      // Limpiar YA: sin esto se veían los mensajes del amigo anterior hasta
      // que resolvía la consulta. El placeholder de carga cubre la espera.
      setMessages([])
      setLoadingMore(true)
      // Abrir el chat limpia los no leídos de ese amigo.
      setUnread((prev) => {
        if (!(friend.id in prev)) return prev
        const next = { ...prev }
        delete next[friend.id]
        return next
      })
      if (!accountId) {
        setLoadingMore(false)
        return
      }
      const result = await social.listMessages(accountId, friend.id, null, 50)
      // Cambió de chat mientras cargaba: no pisar la conversación nueva.
      if (seq !== openChatSeq.current) return
      if (result.ok) {
        setMessages(result.data)
        setHasMore(result.data.length >= 50)
      } else {
        setMessages([])
      }
      setLoadingMore(false)
      void social.markRead(accountId, friend.id)
    },
    [accountId]
  )

  const loadMore = useCallback(async (): Promise<void> => {
    if (!accountId || !activePeerRef.current || loadingMore || !hasMore) return
    setLoadingMore(true)
    const beforeId = messages[0]?.id ?? null
    const result = await social.listMessages(accountId, activePeerRef.current.id, beforeId, 50)
    if (result.ok) {
      if (result.data.length < 50) setHasMore(false)
      if (result.data.length > 0) {
        setMessages((prev) => [...result.data, ...prev])
      }
    }
    setLoadingMore(false)
  }, [accountId, loadingMore, hasMore, messages])

  const closeChat = useCallback((): void => {
    openChatSeq.current += 1
    setActivePeer(null)
    setLoadingMore(false)
    setViewState('home')
  }, [])

  const sendMessage = useCallback(
    async (body: string, attachments: ImageUpload[] = []): Promise<AccountActionResult> => {
      const peer = activePeerRef.current
      const id = accountIdRef.current
      if (!peer || !id) return { ok: false, error: t('social.no.hay.conversacion.abierta') }
      // Slowmode: se evalúa antes de tocar la red.
      const slow = slowmodeMessage()
      if (slow) return { ok: false, error: slow }
      const result = await social.sendMessage(id, peer.id, body, replyTo?.id ?? null, attachments)
      if (!result.ok) {
        // Backstop de la DB: mismo mensaje simpático que el slowmode del cliente.
        if (result.error === 'msg_ratelimited') {
          return {
            ok: false,
            error: SLOWMODE_MESSAGES[Math.floor(Math.random() * SLOWMODE_MESSAGES.length)]
          }
        }
        return { ok: false, error: result.error }
      }
      sendTimesRef.current.push(Date.now())
      setMessages((prev) => [...prev, result.data])
      setReplyTo(null)
      return { ok: true }
    },
    [replyTo, slowmodeMessage]
  )

  const editMessage = useCallback(
    async (messageId: string, body: string): Promise<AccountActionResult> => {
      if (!accountId) return { ok: false, error: t('social.sin.cuenta') }
      const result = await social.editMessage(accountId, messageId, body)
      if (!result.ok) return { ok: false, error: result.error }
      setMessages((prev) => prev.map((m) => (m.id === messageId ? result.data : m)))
      return { ok: true }
    },
    [accountId]
  )

  const deleteMessage = useCallback(
    async (messageId: string): Promise<AccountActionResult> => {
      if (!accountId) return { ok: false, error: t('social.sin.cuenta') }
      const result = await social.deleteMessage(accountId, messageId)
      if (!result.ok) return { ok: false, error: result.error }
      setMessages((prev) => prev.filter((m) => m.id !== messageId))
      return { ok: true }
    },
    [accountId]
  )

  const sendTyping = useCallback((typing: boolean) => {
    if (!accountId || !activePeerRef.current) return
    void social.sendTyping(accountId, activePeerRef.current.id, typing)
  }, [accountId])

  const value = useMemo(
    () => ({
      accountId,
      me,
      needsProfile,
      friends,
      requests,
      accounts,
      activeAccount,
      activePeer,
      messages,
      unread,
      friendsPresence,
      ideContext,
      replyTo,
      typingByPeer,
      hasMore,
      loadingMore,
      ready,
      view,
      requestCode,
      verifyCode,
      updateProfile,
      updateActivity,
      setPresence,
      signOut,
      setView,
      refresh,
      switchAccount,
      removeAccount,
      addAccount,
      searchUsers,
      sendRequest,
      respondRequest,
      removeFriend,
      openChat,
      closeChat,
      sendMessage,
      editMessage,
      deleteMessage,
      setReplyTo,
      sendTyping,
      loadMore
    }),
    [
      accountId,
      me,
      needsProfile,
      friends,
      requests,
      accounts,
      activeAccount,
      activePeer,
      messages,
      unread,
      friendsPresence,
      ideContext,
      replyTo,
      typingByPeer,
      hasMore,
      loadingMore,
      ready,
      view,
      requestCode,
      verifyCode,
      updateProfile,
      updateActivity,
      setPresence,
      signOut,
      setView,
      refresh,
      switchAccount,
      removeAccount,
      addAccount,
      searchUsers,
      sendRequest,
      respondRequest,
      removeFriend,
      openChat,
      closeChat,
      sendMessage,
      editMessage,
      deleteMessage
    ]
  )

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>
}

export function useSocial(): SocialContextValue {
  const context = useContext(SocialContext)
  if (!context) {
    throw new Error(t('social.usesocial.debe.usarse.dentro.de'))
  }
  return context
}
