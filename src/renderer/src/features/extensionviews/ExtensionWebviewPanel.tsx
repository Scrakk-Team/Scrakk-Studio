/**
 * Panel de webview del EDITOR (`window.createWebviewPanel`).
 *
 * Igual que la vista de la activity bar: iframe aislado servido por
 * `scrakk-ext://`, mensajes por el shim `acquireVsCodeApi()` y el host en el
 * medio. La diferencia es dónde vive — es una TAB del centro, no un panel de
 * la barra lateral.
 *
 * La extensión ya está activa cuando este panel existe (lo creó ella), así que
 * no hay que asegurar el host: sólo montar el iframe y enrutar los mensajes.
 */

import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { usePanelTitleOptional } from '@features/layout/state/PanelTitleContext'
import { usePanelIdOptional } from '@features/layout/state/PanelIdContext'
import { extensionPanels } from '@services/extensions/webviewPanels'
import { getHostBridge, parseWebviewPanelId } from './panelBridge'
import styles from './ExtensionViewPanel.module.css'

export function ExtensionWebviewPanel(): JSX.Element {
  const panelId = usePanelIdOptional()
  const rawId = useMemo(() => (panelId === null ? null : parseWebviewPanelId(panelId)), [panelId])
  const model = rawId === null ? undefined : extensionPanels.get(rawId)
  const extensionId = model?.extensionId ?? null

  const [documentUrl, setDocumentUrl] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const frameRef = useRef<HTMLIFrameElement | null>(null)

  // El título de la tab lo maneja la extensión (`panel.title = …`).
  const header = usePanelTitleOptional()
  const setTitleRef = useRef(header?.setTitle)
  setTitleRef.current = header?.setTitle

  useEffect(() => {
    if (!model) return
    setTitleRef.current?.(model.title)
  }, [model?.title, model])

  // ── Documento del panel (`scrakk-ext://…/__panel__/<id>`) ───────────────
  useEffect(() => {
    if (rawId === null || extensionId === null) return
    const host = getHostBridge()
    if (!host) {
      setError('El puente nativo no está disponible en este entorno.')
      return
    }
    let cancelled = false
    void host
      .panelUrl({ id: extensionId, panelId: rawId })
      .then((url) => {
        if (!cancelled) setDocumentUrl(url)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      cancelled = true
    }
  }, [rawId, extensionId])

  // ── Eventos del host hacia este panel ──────────────────────────────────
  useEffect(() => {
    if (rawId === null || extensionId === null) return
    const host = getHostBridge()
    if (!host) return

    return host.onEvent((message) => {
      if (message.extensionId !== extensionId) return
      const payload = message.payload as { id?: string; title?: string; message?: unknown } | undefined
      if (payload?.id !== rawId && (payload as { viewId?: string } | undefined)?.viewId !== rawId) return

      switch (message.event) {
        case 'panel/update':
          // La extensión (re)publicó HTML: recargar el documento.
          setReload((n) => n + 1)
          break
        case 'view/post':
          frameRef.current?.contentWindow?.postMessage(payload?.message, '*')
          break
        case 'panel/close':
          // El panel se cerró del lado de la extensión: el store ya se encarga
          // de la tab; aquí sólo se corta el iframe.
          setDocumentUrl(null)
          break
        default:
          break
      }
    })
  }, [rawId, extensionId])

  // ── Mensajes del iframe hacia la extensión ─────────────────────────────
  useEffect(() => {
    if (rawId === null || extensionId === null) return
    const host = getHostBridge()
    if (!host) return

    const onMessage = (event: MessageEvent): void => {
      if (event.source !== frameRef.current?.contentWindow) return
      const data = event.data as { __scrakk?: boolean; message?: unknown; error?: string } | null
      if (!data || typeof data !== 'object' || data.__scrakk !== true) return
      if (typeof data.error === 'string') {
        console.warn(`[extension-panel ${rawId}]`, data.error)
        return
      }
      if ('message' in data) {
        void host.viewMessage({ id: extensionId, viewId: rawId, message: data.message })
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [rawId, extensionId])

  if (rawId === null || !model || extensionId === null) {
    return (
      <div className={styles.host} data-ext-panel={panelId ?? ''}>
        <div className={styles.overlay} role="status">
          <p className={styles.hint}>Este panel de extensión ya no está disponible.</p>
        </div>
      </div>
    )
  }

  const frameSrc =
    documentUrl === null
      ? null
      : reload === 0
        ? documentUrl
        : `${documentUrl}${documentUrl.includes('?') ? '&' : '?'}r=${reload}`

  return (
    <div className={styles.host} data-ext-panel={rawId}>
      {error !== null ? (
        <div className={styles.overlay} role="status">
          <p className={styles.error}>{error}</p>
        </div>
      ) : null}
      {documentUrl === null && error === null ? (
        <div className={styles.overlay} role="status">
          <p className={styles.hint}>Cargando el panel de la extensión…</p>
        </div>
      ) : null}
      {frameSrc !== null ? (
        <iframe
          ref={frameRef}
          className={styles.frame}
          title={model.title}
          src={frameSrc}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
        />
      ) : null}
    </div>
  )
}
