/**
 * Extension Host — puente del proceso main.
 *
 * Tres responsabilidades:
 *  1. **Lanzar y hablar** con el host (`ExtensionHostManager`).
 *  2. **Servir** los documentos de webview por el esquema `scrakk-ext://`
 *     (los iframes de los paneles de la activity bar).
 *  3. **Rutear** lo que necesita la UI real: notificaciones y comandos viven
 *     en el renderer, así que el main hace de puente y espera la respuesta.
 *
 * Regla de oro: el renderer NUNCA habla con el proceso de la extensión. Pide
 * por IPC, y aquí se valida (permisos, jail de paths) antes de tocar el host.
 */

import { BrowserWindow, app, ipcMain, protocol, type WebContents } from 'electron'
import * as fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import * as path from 'node:path'
import {
  EXTENSION_HOST_IPC,
  type DocumentEvent,
  type HostCommandRequest,
  type HostCommandResponse,
  type HostEnsureRequest,
  type HostEnsureResponse,
  type HostEventMessage,
  type HostInvokeRequest,
  type HostInvokeResult,
  type HostResolveViewResponse,
  type HostSimpleResponse,
  type HostTreeChildrenRequest,
  type HostTreeChildrenResponse,
  type HostTreeSelectRequest,
  type HostTreeSelectResponse,
  type HostViewMessageRequest,
  type HostViewRequest
} from '@shared/extensions'
import type { ExtensionHostMode, NotifyPayload } from '@shared/extensionHost/protocol'
import { ExtensionHostManager, type RendererInvoker } from '../extensions/hostManager'
import { flattenConfigurationDefaults } from '../extensions/host/vscodeApi'
import { setExtensionProvidersQueryFn } from '../extensions/providerBridge'

export const EXTENSION_SCHEME = 'scrakk-ext'

/** Segmento reservado de URL para el documento de una vista. */
const VIEW_SEGMENT = '__view__'

/**
 * Segmento reservado para el documento de un PANEL del editor.
 * Comparte esquema, CSP, shim y assets con las vistas: una extensión no
 * escribe dos webviews distintos.
 */
const PANEL_SEGMENT = '__panel__'

/**
 * Debe correr ANTES de `app.whenReady()` (Electron exige registrar los
 * esquemas privilegiados al principio). Sin esto el iframe no puede cargar
 * `scrakk-ext://` ni usar fetch/localStorage desde el webview.
 */
export function registerExtensionScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: EXTENSION_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true
      }
    }
  ])
}

// ── Rutas ─────────────────────────────────────────────────────────────────

function extensionsRoot(): string {
  return path.join(app.getPath('userData'), 'extensions')
}

/** Manifest SEF del paquete instalado (o null si no se puede leer). */
async function readInstalledManifest(
  extensionId: string
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(
      path.join(extensionsRoot(), extensionId, 'manifest.json'),
      'utf-8'
    )
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Resuelve una ruta pedida dentro del paquete, o null si se escapa. */
function safeResolveInside(extensionId: string, relative: string): string | null {
  const root = path.join(extensionsRoot(), extensionId)
  const target = path.resolve(root, relative)
  const normalizedRoot = path.resolve(root)
  if (target !== normalizedRoot && !target.startsWith(normalizedRoot + path.sep)) return null
  return target
}

// ── Webview: shim + CSP ───────────────────────────────────────────────────

/**
 * `acquireVsCodeApi` para el documento del webview.
 *
 * En VS Code lo provee el host dentro del iframe. Aquí se inyecta antes del
 * HTML de la extensión. La recepción de mensajes NO necesita shim: el padre
 * hace `postMessage` al iframe y el navegador dispara el `message` normal.
 */
const WEBVIEW_SHIM = `<script>
(function () {
  var state;
  var acquired = false;
  window.acquireVsCodeApi = function () {
    if (acquired) console.warn('[webview] acquireVsCodeApi() llamado más de una vez');
    acquired = true;
    return {
      postMessage: function (message) {
        parent.postMessage({ __scrakk: true, message: message }, '*');
      },
      getState: function () { return state; },
      setState: function (next) { state = next; return state; }
    };
  };
  // Errores del panel: que se vean en la consola del IDE y no en silencio.
  window.addEventListener('error', function (event) {
    parent.postMessage({ __scrakk: true, error: String(event.message) }, '*');
  });
})();
</script>`

/**
 * CSP del documento del webview. Sigue el modelo de VS Code: parte de
 * `default-src 'none'` y sólo habilita lo que un panel necesita. Lo que la
 * extensión declare en `webview.options` no se aplica todavía (v1), así que
 * la política es la de un panel típico tipo chat: assets locales, https para
 * API, nada de frames anidados.
 */
function webviewCsp(extensionId: string): string {
  const source = `${EXTENSION_SCHEME}://${extensionId}`
  return [
    "default-src 'none'",
    `img-src ${source} https: data:`,
    `media-src ${source} https: data:`,
    `script-src ${source} 'unsafe-inline' https:`,
    `style-src ${source} 'unsafe-inline' https:`,
    `font-src ${source} https: data:`,
    `connect-src ${source} https: wss:`,
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ')
}

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.html': 'text/html',
  '.wasm': 'application/wasm'
}

// ── Registro ──────────────────────────────────────────────────────────────

let manager: ExtensionHostManager | null = null

let invokeCounter = 0
const pendingInvokes = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
>()

/** webContents donde vive la UI (la ventana principal). */
function uiContents(): WebContents | null {
  return BrowserWindow.getAllWindows()[0]?.webContents ?? null
}

/**
 * Puente main → renderer para notificaciones y comandos: son registries de la
 * UI, así que se le pide al renderer y se espera su respuesta.
 */
/**
 * ¿La UI ya conectó su puente (`onInvoke`)?
 *
 * Sin esto, una petición mandada antes del boot del renderer se pierde y el
 * host espera hasta su timeout: un cuelgue mudo de 30 s que parece un bug de
 * la extensión (medido con Cline). Mejor fallar rápido y con el motivo.
 */
let uiBridgeReady = false

const rendererInvoker: RendererInvoker = {
  invoke(method, params, timeoutMs = 30_000) {
    const contents = uiContents()
    if (!contents) return Promise.reject(new Error('no hay ventana para atender la petición'))
    if (!uiBridgeReady) {
      return Promise.reject(
        new Error(
          'la UI todavía no conectó el puente del Extension Host (el renderer no está listo): ' +
            `no se puede atender "${method}"`
        )
      )
    }
    const invokeId = ++invokeCounter
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingInvokes.delete(invokeId)
        reject(new Error(`la UI no respondió a "${method}" en ${timeoutMs}ms`))
      }, timeoutMs)
      pendingInvokes.set(invokeId, { resolve, reject, timer })
      const request: HostInvokeRequest = {
        invokeId,
        method: method as HostInvokeRequest['method'],
        params
      }
      contents.send(EXTENSION_HOST_IPC.invoke, request)
    })
  }
}

export function registerExtensionHostIpc(): void {
  manager = new ExtensionHostManager({
    renderer: rendererInvoker,
    sink: {
      onHostEvent(extensionId, event, payload) {
        const message: HostEventMessage = {
          extensionId,
          event: event as HostEventMessage['event'],
          payload
        }
        uiContents()?.send(EXTENSION_HOST_IPC.event, message)
      },
      onHostExit(extensionId, code, reason) {
        uiContents()?.send(EXTENSION_HOST_IPC.event, {
          extensionId,
          event: 'exit',
          payload: { code, reason }
        } satisfies HostEventMessage)
      }
    }
  })

  // Proveedores de lenguaje: el IPC del LSP pregunta "dame el hover de esta
  // posición" y este puente se lo reparte a TODOS los hosts vivos. Cada uno
  // decide si su selector atiende el documento (`matched`); los que no opinan
  // no aparecen en la respuesta.
  setExtensionProvidersQueryFn(async (query) => {
    const active = manager
    if (!active) return []
    const answers = await Promise.all(
      active.activeHostIds().map(async (extensionId) => {
        try {
          const result = await active.queryProvider(extensionId, query)
          if (!result?.matched) return null
          return { extensionId, result: result.result }
        } catch (error) {
          // Un host que no contesta (o murió en el medio) no puede tumbar el
          // hover de la app: se reporta y se sigue con los demás.
          console.warn(
            `[providers] ${extensionId} no respondió la consulta de ${query.kind}: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
          return null
        }
      })
    )
    return answers.filter((answer): answer is { extensionId: string; result: unknown } =>
      Boolean(answer)
    )
  })

  // ── Documentos del editor (renderer → main → hosts) ────────────────────
  // `on` (no `handle`): es un flujo de hechos que se empuja en cada tecla.
  // Bloquear el renderer esperando un acuse por cada cambio de buffer sería
  // un costo real a cambio de nada.
  ipcMain.on(EXTENSION_HOST_IPC.docSync, (_event, events: DocumentEvent[]) => {
    if (!Array.isArray(events) || events.length === 0) return
    manager?.applyDocumentEvents(events)
  })

  // ── Renderer → main ────────────────────────────────────────────────────
  // ── Ajuste de telemetría (renderer → main → hosts) ─────────────────────
  // `on` y no `handle`: el renderer no espera nada, y el valor tiene que
  // llegar a los hosts ANTES de que la extensión lo lea al activar.
  ipcMain.on(EXTENSION_HOST_IPC.telemetry, (_event, payload: { enabled?: boolean }) => {
    manager?.setTelemetryEnabled(payload?.enabled === true)
  })

  ipcMain.handle(
    EXTENSION_HOST_IPC.ensure,
    async (_event, request: HostEnsureRequest): Promise<HostEnsureResponse> => {
      try {
        const manifest = await readInstalledManifest(request.id)
        if (!manifest) return { success: false, error: `extensión no instalada: ${request.id}` }

        const runtime = manifest.runtime as { kind?: string; entry?: string } | undefined
        if (!runtime?.entry) {
          return {
            success: false,
            error: `"${request.id}" no trae código ejecutable (manifest sin runtime.entry)`
          }
        }

        const extensionPath = path.join(extensionsRoot(), request.id)
        await manager!.ensureHost({
          extensionId: request.id,
          extensionPath,
          entry: runtime.entry,
          workspaceRoots: request.workspaceRoots,
          permissions: Array.isArray(manifest.permissions)
            ? (manifest.permissions as string[])
            : [],
          mode: request.mode as ExtensionHostMode,
          configurationDefaults: flattenConfigurationDefaults(
            (manifest.contributes as { configuration?: unknown } | undefined)?.configuration
          )
        })
        const commands = await manager!.activate(request.id)
        return { success: true, commands }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle(
    EXTENSION_HOST_IPC.resolveView,
    async (_event, request: HostViewRequest): Promise<HostResolveViewResponse> => {
      try {
        const kind = await manager!.resolveView(
          request.id,
          request.viewId,
          request.title ?? request.viewId
        )
        return { success: true, kind }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  // ── Vistas de ÁRBOL ─────────────────────────────────────────────────────
  // El renderer pide hijos e items; NUNCA manda argumentos de comando (los
  // recupera el host del elemento original, ver treeViews.ts).
  ipcMain.handle(
    EXTENSION_HOST_IPC.treeChildren,
    async (_event, request: HostTreeChildrenRequest): Promise<HostTreeChildrenResponse> => {
      try {
        const nodes = await manager!.treeChildren(
          request.id,
          request.viewId,
          request.elementId ?? null
        )
        return { success: true, nodes }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle(
    EXTENSION_HOST_IPC.treeSelect,
    async (_event, request: HostTreeSelectRequest): Promise<HostTreeSelectResponse> => {
      try {
        const result = await manager!.treeSelect(request.id, request.viewId, request.elementId)
        return { success: true, ran: result.ran, command: result.command }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  /**
   * El usuario cerró la tab del panel: la extensión tiene que enterarse
   * (dispara su `onDidDispose` y deja de creer que el panel sigue abierto).
   */
  ipcMain.handle(
    EXTENSION_HOST_IPC.panelClose,
    async (_event, request: { id: string; panelId: string }): Promise<HostSimpleResponse> => {
      try {
        await manager!.disposePanel(request.id, request.panelId)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle(
    EXTENSION_HOST_IPC.disposeView,
    async (_event, request: HostViewRequest): Promise<HostSimpleResponse> => {
      try {
        await manager!.disposeView(request.id, request.viewId)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle(
    EXTENSION_HOST_IPC.viewMessage,
    async (_event, request: HostViewMessageRequest): Promise<HostSimpleResponse> => {
      try {
        await manager!.receiveViewMessage(request.id, request.viewId, request.message)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle(
    EXTENSION_HOST_IPC.executeCommand,
    async (_event, request: HostCommandRequest): Promise<HostCommandResponse> => {
      try {
        const result = await manager!.executeCommand(request.id, request.command, request.args ?? [])
        return { success: true, result }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle(
    EXTENSION_HOST_IPC.shutdown,
    async (_event, request: { id: string }): Promise<HostSimpleResponse> => {
      try {
        await manager!.shutdown(request.id)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle(
    EXTENSION_HOST_IPC.webviewUrl,
    (_event, request: HostViewRequest): string =>
      `${EXTENSION_SCHEME}://${request.id}/${VIEW_SEGMENT}/${encodeURIComponent(request.viewId)}`
  )

  /**
   * URL del documento de un PANEL del editor. El segmento va en el camino, así
   * que el panel puede ser cualquiera de los dos (`__view__` o `__panel__`).
   */
  ipcMain.handle(
    EXTENSION_HOST_IPC.panelUrl,
    (_event, request: { id: string; panelId: string }): string =>
      `${EXTENSION_SCHEME}://${request.id}/${PANEL_SEGMENT}/${encodeURIComponent(request.panelId)}`
  )

  // La UI avisa que su puente está escuchando: recién ahí se le pueden mandar
  // peticiones (antes no hay quién conteste).
  ipcMain.on(EXTENSION_HOST_IPC.uiReady, () => {
    uiBridgeReady = true
  })

  // Respuesta del renderer a una petición nuestra (notify / command/execute).
  ipcMain.on(EXTENSION_HOST_IPC.invokeResult, (_event, result: HostInvokeResult) => {
    const pending = pendingInvokes.get(result.invokeId)
    if (!pending) return
    pendingInvokes.delete(result.invokeId)
    clearTimeout(pending.timer)
    if (result.error) pending.reject(new Error(result.error))
    else pending.resolve(result.result)
  })

  // ── Protocolo scrakk-ext:// ────────────────────────────────────────────
  protocol.handle(EXTENSION_SCHEME, async (request) => {
    const url = new URL(request.url)
    const extensionId = url.hostname
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '')

    // 1) Documento de una vista → HTML que publicó la extensión.
    if (relative === VIEW_SEGMENT || relative.startsWith(`${VIEW_SEGMENT}/`)) {
      const viewId = relative.slice(VIEW_SEGMENT.length).replace(/^\/+/, '')
      const record = manager?.viewOf(extensionId, viewId)
      if (!record || record.html.length === 0) {
        return new Response(
          `<!doctype html><meta charset="utf-8"><body style="font:13px system-ui;padding:12px">
           <p>La extensión <b>${escapeHtml(extensionId)}</b> todavía no publicó contenido para
           la vista <code>${escapeHtml(viewId)}</code>.</p></body>`,
          { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
        )
      }
      const document = injectShim(record.html)
      return new Response(document, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy': webviewCsp(extensionId)
        }
      })
    }

    // 1-bis) Documento de un PANEL del editor (misma forma que la vista).
    if (relative === PANEL_SEGMENT || relative.startsWith(`${PANEL_SEGMENT}/`)) {
      const panelId = decodeURIComponent(relative.slice(PANEL_SEGMENT.length).replace(/^\/+/, ''))
      const record = manager?.panelOf(extensionId, panelId)
      if (!record || record.html.length === 0) {
        return new Response(
          `<!doctype html><meta charset="utf-8"><body style="font:13px system-ui;padding:12px">
           <p>El panel <code>${escapeHtml(panelId)}</code> de <b>${escapeHtml(extensionId)}</b> todavía no
           publicó contenido.</p></body>`,
          { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
        )
      }
      return new Response(injectShim(record.html), {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy': webviewCsp(extensionId)
        }
      })
    }

    // 2) Assets del paquete (los que la extensión pide con `asWebviewUri`).
    const target = safeResolveInside(extensionId, relative)
    if (!target || !existsSync(target)) {
      return new Response('no encontrado', { status: 404 })
    }
    try {
      const data = await fs.readFile(target)
      const type = CONTENT_TYPES[path.extname(target).toLowerCase()] ?? 'application/octet-stream'
      return new Response(new Uint8Array(data), {
        status: 200,
        headers: {
          'content-type': type,
          'content-security-policy': webviewCsp(extensionId),
          'cache-control': 'no-cache'
        }
      })
    } catch {
      return new Response('no se pudo leer', { status: 500 })
    }
  })
}

/** Apaga todos los hosts (al cerrar la app). */
export async function shutdownExtensionHosts(): Promise<void> {
  await manager?.shutdownAll()
  manager = null
}

/** Inserta el shim del webview al principio del `<head>` (o del documento). */
function injectShim(html: string): string {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (match) => match + WEBVIEW_SHIM)
  return WEBVIEW_SHIM + html
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Sólo para tests/logs: payload de notificación que llega desde una extensión. */
export type ExtensionNotificationPayload = NotifyPayload
