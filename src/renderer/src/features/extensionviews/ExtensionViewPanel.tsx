/**
 * Panel de un contenedor de extensión (botón de la activity bar).
 *
 * Es el puente entre el layout y el Extension Host:
 *
 *   layout ─▶ este panel ─ensure/resolveView─▶ main ─▶ host (extensión)
 *                   │                                      │
 *                   └──────── iframe aislado ◀── HTML ─────┘
 *
 * Reglas:
 *  - El contenido de la extensión vive en un **iframe** servido por
 *    `scrakk-ext://` con su propia CSP: no comparte DOM ni JS con el IDE.
 *  - Los mensajes del panel pasan por el shim `acquireVsCodeApi()` que inyecta
 *    el main, y acá sólo se reenvían al host.
 *  - Un contenedor puede tener VARIAS vistas (VS Code las apila en
 *    secciones): cada una tiene su header plegable y su contenido.
 *  - Si algo falla se dice QUÉ falló; nunca se queda en blanco para siempre.
 *
 * ── DESVÍO CONSCIENTE DE VS CODE ──────────────────────────────────────────
 * VS Code abre TODAS las secciones del contenedor de entrada. Acá arranca
 * abierta solo la primera y las demás se montan al abrirse: cada sección
 * monta un iframe y resuelve su vista en el host, así que abrirlas todas es
 * un costo que se paga aunque el usuario no las mire. Una vez abierta, la
 * sección queda montada (no se re-resuelve al plegar y desplegar).
 */

import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { ExtensionRegistry } from '@services/extensions'
import { ProductIcon } from '@services/productIcons/components'
import { usePanelTitleOptional } from '@features/layout/state/PanelTitleContext'
import { usePanelIdOptional } from '@features/layout/state/PanelIdContext'
import { getWorkspaceRoot } from '@features/explorer/hooks/useWorkspaceState'
import { visibleViews, type ContainerWelcome } from './containers'
import {
  getExtensionContextKey,
  subscribeToExtensionContextKeys
} from '@services/extensions/hostBridge'
import { ExtensionTreeView } from './ExtensionTreeView'
import { getHostBridge, parseViewPanelId, readHostMode } from './panelBridge'
import styles from './ExtensionViewPanel.module.css'

// ── Envoltorio: contenedor + selector de vistas ───────────────────────────

export function ExtensionViewPanel(): JSX.Element {
  const panelId = usePanelIdOptional()
  const parsed = useMemo(
    () => (panelId === null ? null : parseViewPanelId(panelId)),
    [panelId]
  )
  /** Secciones ABIERTAS por id de vista (la primera arranca abierta). */
  const [open, setOpen] = useState<string[]>([])
  /** Secciones que ya se montaron alguna vez (al plegar no se desmontan). */
  const [mounted, setMounted] = useState<string[]>([])
  // Las extensiones se registran async (boot / instalación en vivo): el mapa
  // de contenedores cambia fuera de React, así que escuchamos el registry.
  const [version, setVersion] = useState(0)
  useEffect(() => ExtensionRegistry.subscribe(() => setVersion((v) => v + 1)), [])

  // Todos los hooks van ANTES de cualquier return (regla de hooks).
  // Solo las vistas VISIBLES: las que la extensión condicionó con `when`
  // (clave de contexto) no se muestran ni se resuelven en el host.
  const views = useMemo(
    () =>
      parsed === null
        ? []
        : visibleViews(parsed.extensionId, parsed.containerId, getExtensionContextKey),
    [parsed, version]
  )

  // Si la extensión cambia una clave de contexto, la visibilidad se recalcula.
  useEffect(
    () => subscribeToExtensionContextKeys(() => setVersion((v) => v + 1)),
    []
  )

  // Se abre sola la primera vista que NO pidió arrancar plegada: VS Code
  // respeta la `visibility` que declaró la extensión.
  const firstOpenViewId = views.find((view) => view.collapsed !== true)?.id ?? null
  useEffect(() => {
    if (firstOpenViewId === null) return
    setOpen((prev) => (prev.length > 0 ? prev : [firstOpenViewId]))
    setMounted((prev) => (prev.includes(firstOpenViewId) ? prev : [...prev, firstOpenViewId]))
  }, [firstOpenViewId])

  if (!parsed) {
    return (
      <Message
        text="Este panel no tiene una vista de extensión asociada."
        detail={panelId ?? undefined}
      />
    )
  }

  if (views.length === 0) {
    return (
      <Message
        text="La extensión no registró ninguna vista en este contenedor."
        detail={`${parsed.extensionId} · ${parsed.containerId}`}
      />
    )
  }

  const toggle = (viewId: string): void => {
    setOpen((prev) => (prev.includes(viewId) ? prev.filter((id) => id !== viewId) : [...prev, viewId]))
    setMounted((prev) => (prev.includes(viewId) ? prev : [...prev, viewId]))
  }

  // Una sola vista: se monta directo, sin header de sección (el título del
  // panel ya dice cuál es).
  if (views.length === 1) {
    return (
      <div className={styles.host} data-ext-view={panelId ?? ''}>
        <ExtensionView
          extensionId={parsed.extensionId}
          viewId={views[0].id}
          viewName={views[0].name}
          welcome={views[0].welcome}
        />
      </div>
    )
  }

  return (
    <div className={styles.host} data-ext-view={panelId ?? ''}>
      <div className={styles.sections}>
        {views.map((view) => {
          const isOpen = open.includes(view.id)
          return (
            <section
              key={view.id}
              className={[styles.section, isOpen ? styles.sectionOpen : null]
                .filter(Boolean)
                .join(' ')}
              data-ext-section={view.id}
            >
              <button
                type="button"
                className={styles.sectionHeader}
                aria-expanded={isOpen}
                aria-controls={`ext-section-${view.id}`}
                onClick={() => toggle(view.id)}
              >
                <span
                  className={[styles.sectionChevron, isOpen ? styles.sectionChevronOpen : null]
                    .filter(Boolean)
                    .join(' ')}
                  aria-hidden="true"
                >
                  <ProductIcon id="chevron-right" size={12} />
                </span>
                {view.name}
              </button>
              {/* Montada de verdad solo si está abierta (o ya lo estuvo). */}
              {isOpen && mounted.includes(view.id) ? (
                <div className={styles.sectionBody} id={`ext-section-${view.id}`}>
                  <ExtensionView
                    extensionId={parsed.extensionId}
                    viewId={view.id}
                    viewName={view.name}
                    welcome={view.welcome}
                  />
                </div>
              ) : null}
            </section>
          )
        })}
      </div>
    </div>
  )
}

// ── Una vista: el iframe y su puente con el host ──────────────────────────

function ExtensionView({
  extensionId,
  viewId,
  viewName,
  welcome
}: {
  extensionId: string
  viewId: string
  viewName: string
  /** `viewsWelcome`: lo que la extensión declaró para su vista vacía. */
  welcome?: ContainerWelcome[]
}): JSX.Element {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  /** Qué está haciendo la extensión mientras arranca (heartbeat del host). */
  const [progress, setProgress] = useState<string | null>(null)
  // Qué es esta vista lo dice LA EXTENSIÓN: webview (publica HTML) o árbol
  // (sirve nodos). Se pregunta con `resolveView` en vez de adivinarlo por el
  // manifest, que puede mentir.
  const [kind, setKind] = useState<'webview' | 'tree' | null>(null)
  const [documentUrl, setDocumentUrl] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [workspaceVersion, setWorkspaceVersion] = useState(0)
  const frameRef = useRef<HTMLIFrameElement | null>(null)

  // El título del header lo puede cambiar la extensión (`view.title`).
  const header = usePanelTitleOptional()
  const setTitleRef = useRef(header?.setTitle)
  setTitleRef.current = header?.setTitle

  // Si cambia el workspace abierto, el jail del fs del host queda viejo: hay
  // que volver a asegurar el host con los roots nuevos.
  useEffect(() => {
    const onWorkspaceChanged = (): void => setWorkspaceVersion((v) => v + 1)
    window.addEventListener('workspace-changed', onWorkspaceChanged)
    return () => window.removeEventListener('workspace-changed', onWorkspaceChanged)
  }, [])

  // ── Arranque: asegurar host, pedir la vista y su documento ──────────────
  useEffect(() => {
    const host = getHostBridge()
    if (!host) {
      setStatus('error')
      setError('El puente nativo no está disponible en este entorno (¿build web?).')
      return
    }

    let cancelled = false
    void (async () => {
      const root = getWorkspaceRoot()
      const ensured = await host.ensure({
        id: extensionId,
        workspaceRoots: root ? [root] : [],
        mode: readHostMode(extensionId)
      })
      if (cancelled) return
      if (!ensured.success) {
        setStatus('error')
        setError(ensured.error)
        return
      }

      const resolved = await host.resolveView({ id: extensionId, viewId, title: viewName })
      if (cancelled) return
      if (!resolved.success) {
        setStatus('error')
        setError(resolved.error ?? 'La extensión no pudo resolver la vista.')
        return
      }

      if (resolved.kind === 'tree') {
        // Vista de árbol: los nodos los pide `ExtensionTreeView`.
        setKind('tree')
        setStatus('ready')
        return
      }

      setKind('webview')
      const url = await host.webviewUrl({ id: extensionId, viewId })
      if (cancelled) return
      setDocumentUrl(url)
      setStatus('ready')
    })()

    return () => {
      cancelled = true
    }
  }, [extensionId, viewId, viewName, workspaceVersion])

  // ── Eventos del host hacia este panel ──────────────────────────────────
  useEffect(() => {
    const host = getHostBridge()
    if (!host) return

    return host.onEvent((message) => {
      if (message.extensionId !== extensionId) return
      const payload = message.payload as
        | { viewId?: string; title?: string; message?: unknown }
        | undefined

      switch (message.event) {
        case 'view/html':
          // La extensión (re)publicó contenido: recargar el documento.
          if (payload?.viewId === viewId) setReload((n) => n + 1)
          break
        case 'view/title':
          if (payload?.viewId === viewId && payload.title) setTitleRef.current?.(payload.title)
          break
        case 'view/post':
          if (payload?.viewId !== viewId) return
          frameRef.current?.contentWindow?.postMessage(payload.message, '*')
          break
        case 'activate/progress': {
          // `activate` de una extensión NO tiene timeout (igual que en VS Code):
          // si tarda o se cuelga, acá se ve en qué está, en vez de un
          // "Iniciando…" mudo para siempre.
          const info = message.payload as { seconds?: number; pending?: string[] } | undefined
          const pending = info?.pending ?? []
          setProgress(
            `${info?.seconds ?? 0} s` +
              (pending.length > 0 ? ` · esperando: ${pending.join(', ')}` : ' · trabajando')
          )
          break
        }
        case 'fatal':
          setStatus('error')
          setError(String((payload as { message?: string })?.message ?? 'La extensión falló.'))
          break
        case 'exit':
          setStatus('error')
          setError('El proceso de la extensión terminó.')
          break
        default:
          break
      }
    })
  }, [extensionId, viewId])

  // ── Mensajes del iframe hacia la extensión ─────────────────────────────
  useEffect(() => {
    const host = getHostBridge()
    if (!host) return

    const onMessage = (event: MessageEvent): void => {
      // Sólo escuchamos a NUESTRO iframe: la app también usa postMessage.
      if (event.source !== frameRef.current?.contentWindow) return
      const data = event.data as { __scrakk?: boolean; message?: unknown; error?: string } | null
      if (!data || typeof data !== 'object' || data.__scrakk !== true) return
      if (typeof data.error === 'string') {
        console.warn(`[extension-view ${viewId}]`, data.error)
        return
      }
      if ('message' in data) {
        void host.viewMessage({ id: extensionId, viewId, message: data.message })
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [extensionId, viewId])

  // ── Al desmontar: liberar la vista en la extensión ─────────────────────
  useEffect(() => {
    const host = getHostBridge()
    if (!host) return
    return () => {
      void host.disposeView({ id: extensionId, viewId })
    }
  }, [extensionId, viewId])

  const frameSrc =
    documentUrl === null
      ? null
      : reload === 0
        ? documentUrl
        : `${documentUrl}${documentUrl.includes('?') ? '&' : '?'}r=${reload}`

  // Vista de ÁRBOL: el IDE pinta los nodos que sirve la extensión.
  if (kind === 'tree' && status === 'ready') {
    return (
      <ExtensionTreeView extensionId={extensionId} viewId={viewId} welcome={welcome} />
    )
  }

  return (
    <>
      {status !== 'ready' ? (
        <div className={styles.overlay} role="status">
          {status === 'error' ? (
            <>
              <p className={styles.error}>{error}</p>
              <p className={styles.hint}>
                Extensión <code>{extensionId}</code> · Vista <code>{viewId}</code>
              </p>
            </>
          ) : (
            <>
              <p className={styles.hint}>Iniciando el panel de la extensión…</p>
              {progress ? <p className={styles.hint}>{progress}</p> : null}
            </>
          )}
        </div>
      ) : null}
      {frameSrc !== null ? (
        <iframe
          ref={frameRef}
          className={styles.frame}
          title={viewName}
          src={frameSrc}
          // Aislado del IDE: sin `allow-top-navigation` ni acceso al DOM del
          // padre. `allow-same-origin` conserva el origen `scrakk-ext://` de
          // la extensión (localStorage propio) sin dar acceso al IDE, que
          // vive en otro origen.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
        />
      ) : null}
    </>
  )
}

function Message({ text, detail }: { text: string; detail?: string }): JSX.Element {
  return (
    <div className={styles.host} data-ext-view-message="1">
      <div className={styles.overlay} role="status">
        <p className={styles.error}>{text}</p>
        {detail ? (
          <p className={styles.hint}>
            <code>{detail}</code>
          </p>
        ) : null}
      </div>
    </div>
  )
}
