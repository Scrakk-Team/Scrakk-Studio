/**
 * Puente host ↔ UI (lado renderer).
 *
 * El main rutea a la UI lo que sólo la UI sabe hacer: mostrar una notificación
 * y elegir qué botón se apretó, correr un comando del registry REAL del IDE y
 * abrir un archivo en el editor. Acá se atiende esa petición y se responde con
 * `respondInvoke`.
 *
 * ESTO FALTABA: el main mandaba `extensions:host-invoke` y NADIE escuchaba, así
 * que `vscode.window.showInformationMessage` desde una extensión se quedaba
 * esperando hasta el timeout de 30 s (y un comando pedido por la extensión al
 * IDE, igual). Un aviso silencioso que rompe a la extensión lejos de la causa.
 *
 * También registra los items de barra de estado que las extensiones crean, en
 * el store que consume la StatusBar.
 */

import { openFileInEditor } from '@features/editor'
import { notify } from '@services/notifications'
import type {
  DocumentEvent,
  ExtensionDecorationsPayload,
  ExtensionDiagnosticsPayload,
  NotifyResult,
  StatusBarItemModel,
  StatusBarItemPayload
} from '@shared/extensionHost/protocol'
import { clearDecorations, fromHostDecoration, setDecorations } from '@services/decorations'
import {
  applyExtensionDiagnostics,
  dropExtensionDiagnostics
} from '@services/lsp/diagnosticsStore'
import type { HostEventMessage, HostInvokeRequest } from '@shared/extensions'
import { extensionStatusBar } from './statusBar'
import { extensionPanels } from './webviewPanels'
import { commandUnavailableReason } from '@shared/compatibility/vscode/commands/builtin'
import { runVSCodeCommand } from './vscodeCommands'

/** `severity` del host → severidad de la app. */
function toSeverity(severity: string): 'info' | 'warn' | 'error' {
  if (severity === 'error') return 'error'
  if (severity === 'warning' || severity === 'warn') return 'warn'
  return 'info'
}

/**
 * Muestra una notificación y ESPERA la elección. Se resuelve con el índice del
 * botón elegido, o con `{}` si el usuario la cerró sin elegir.
 *
 * Lo que llega del host se NORMALIZA acá (texto a `string`, botones sin texto
 * afuera): la UI no puede intentar renderizar un objeto como si fuera texto.
 * El bug que originó esto: Cline manda `MessageOptions` (`{modal, detail}`) y
 * ese objeto llegó a la lista de botones, la UI lo renderizó y React tumbó la
 * app entera — con la app muerta, TODA petición de la extensión queda colgada
 * y su `activate` nunca resuelve. Un dato mal formado no puede costar la app.
 */
function showExtensionNotification(payload: {
  title?: unknown
  message?: unknown
  severity?: unknown
  detail?: unknown
  modal?: unknown
  actions?: unknown
}): Promise<NotifyResult> {
  return new Promise<NotifyResult>((resolve) => {
    let settled = false
    const finish = (result: NotifyResult): void => {
      if (settled) return
      settled = true
      resolve(result)
    }
    // Sólo strings con contenido son botones (máx. 3, igual que el API de la app).
    const buttons = (Array.isArray(payload.actions) ? payload.actions : [])
      .map((label) => (typeof label === 'string' ? label.trim() : ''))
      .filter((label) => label.length > 0)
      .slice(0, 3)
    const actions = buttons.map((label, index) => ({
      label,
      run: () => finish({ actionIndex: index })
    }))
    notify({
      title: typeof payload.title === 'string' && payload.title ? payload.title : 'Extensión',
      message: typeof payload.message === 'string' ? payload.message : String(payload.message ?? ''),
      detail: typeof payload.detail === 'string' && payload.detail ? payload.detail : undefined,
      severity: toSeverity(String(payload.severity ?? 'info')),
      // Con botones, persistente: si se auto-cierra solo, el usuario no llega a
      // elegir y la extensión recibe un "cerrada" sin haber podido contestar.
      // Igual una `modal` de VS Code: no se va sola.
      timeoutMs: actions.length > 0 || payload.modal === true ? 0 : undefined,
      actions: actions.length > 0 ? actions : undefined,
      onClose: () => finish({})
    })
  })
}

/** Resuelve la petición del main. Devuelve el resultado que espera el host. */
async function handleInvoke(request: HostInvokeRequest): Promise<unknown> {
  if (request.method === 'notify') {
    return await showExtensionNotification(
      request.params as {
        title?: unknown
        message?: unknown
        severity?: unknown
        detail?: unknown
        modal?: unknown
        actions?: unknown
      }
    )
  }

  if (request.method === 'command/execute') {
    const { id, args } = request.params as { id: string; args?: unknown[] }
    // Los comandos del IDE no llevan argumentos: los que sí (los de las
    // extensiones) los rutea el main al host dueño, no llegan hasta acá.
    //
    // Los ids de VS Code pasan PRIMERO por el mapa de compatibilidad: los
    // args importan (`vscode.open` recibe la URI) y los built-in del entorno
    // (`workbench.action.*`) no existen en el registry nativo del IDE. Si
    // nadie lo tiene, el error dice POR QUÉ cuando el comando está declarado
    // como sin equivalente: la alternativa era un "no existe" indistinguible
    // de un id mal escrito.
    const ran = await runVSCodeCommand(id, Array.isArray(args) ? args : [])
    if (!ran) throw new Error(commandUnavailableReason(id))
    return { ran: true }
  }

  if (request.method === 'editor/open') {
    const { path } = request.params as { path: string }
    const name = path.replace(/\\/g, '/').split('/').pop() ?? path
    openFileInEditor(path, name)
    return { success: true }
  }

  throw new Error(`el renderer no sabe atender "${String(request.method)}"`)
}

/**
 * Claves de contexto puestas con `setContext` por las extensiones.
 *
 * Las usa el IDE para condicionar UI (`when`). Se guardan por clave suelta
 * (el namespace es global en VS Code: `setContext('foo', 1)` y ya).
 */
const contextKeys = new Map<string, unknown>()

/**
 * Suscriptores de cambios de claves de contexto. La UI que depende de `when`
 * (activity bar, vistas) se re-renderiza cuando la extensión publica una.
 */
const contextKeyListeners = new Set<() => void>()

/** Lee una clave de contexto (para condicionar UI/menús desde una extensión). */
export function getExtensionContextKey(key: string): unknown {
  return contextKeys.get(key)
}

/** Avisa cuando cambia CUALQUIER clave de contexto. Devuelve la baja. */
export function subscribeToExtensionContextKeys(listener: () => void): () => void {
  contextKeyListeners.add(listener)
  return () => {
    contextKeyListeners.delete(listener)
  }
}

/** Registra los eventos del host que la UI debe reflejar (status, paneles). */
function handleHostEvent(message: HostEventMessage): void {
  if (message.event === 'context/key') {
    const payload = message.payload as { key?: string; value?: unknown } | undefined
    if (typeof payload?.key === 'string') {
      contextKeys.set(payload.key, payload.value)
      for (const listener of [...contextKeyListeners]) {
        try {
          listener()
        } catch {
          // Un suscriptor roto no tumba a los demás.
        }
      }
    }
    return
  }
  if (message.event === 'status/item') {
    extensionStatusBar.apply(message.payload as StatusBarItemPayload)
    return
  }
  if (message.event === 'diagnostics/change') {
    // Los problemas de la extensión entran al MISMO store que los del LSP:
    // cada fuente tiene su entrada, así una no borra a la otra.
    const payload = message.payload as ExtensionDiagnosticsPayload | undefined
    applyExtensionDiagnostics(message.extensionId, payload?.entries ?? [])
    return
  }
  if (message.event === 'decorations/set') {
    // `editor.setDecorations`: los rangos se subrayan DENTRO del texto. Cada
    // extensión es su propia fuente, así que su `dispose()` (o apagarla) borra
    // sólo lo suyo y no lo que pintó otra.
    applyExtensionDecorations(message.extensionId, message.payload as ExtensionDecorationsPayload)
    return
  }
  if (message.event === 'panel/open' || message.event === 'panel/update') {
    const payload = message.payload as {
      id?: string
      title?: string
      extensionId?: string
      viewColumn?: number
      visible?: boolean
      hasHtml?: boolean
    }
    if (!payload?.id) return
    // Un `panel/update` (HTML nuevo) no trae el modelo completo: se completa
    // con lo que ya conocemos para no perder título ni visibilidad.
    const existing = extensionPanels.get(payload.id)
    extensionPanels.upsert({
      id: payload.id,
      extensionId: payload.extensionId ?? existing?.extensionId ?? message.extensionId,
      title: payload.title ?? existing?.title ?? payload.id,
      viewColumn: payload.viewColumn ?? existing?.viewColumn ?? 1,
      visible: payload.visible ?? existing?.visible ?? true,
      hasHtml: payload.hasHtml ?? existing?.hasHtml ?? false
    })
    return
  }
  if (message.event === 'panel/close') {
    extensionPanels.close((message.payload as { id: string }).id)
    return
  }
  if (message.event === 'exit') {
    // El host murió: sus items, paneles y problemas no pueden quedar fantasma
    // en la UI (un error de una extensión que ya no corre no se puede arreglar
    // ni silenciar).
    extensionStatusBar.dropExtension(message.extensionId)
    extensionPanels.dropExtension(message.extensionId)
    dropExtensionDiagnostics(message.extensionId)
    clearDecorations(extensionDecorationSource(message.extensionId))
  }
}

/** Fuente de decoraciones de una extensión (una sola, en los dos caminos). */
export function extensionDecorationSource(extensionId: string): string {
  return `extension:${extensionId}`
}

/**
 * Decoraciones por rango que empujó una extensión (`editor.setDecorations`).
 *
 * Una lista vacía BORRA el archivo: es lo que manda el host cuando la
 * extensión limpió su estado, y sin eso el subrayado viejo quedaría pintado
 * para siempre (el mismo contrato que los diagnósticos).
 */
export function applyExtensionDecorations(
  extensionId: string,
  payload: ExtensionDecorationsPayload | undefined
): void {
  const sourceId = extensionDecorationSource(extensionId)
  for (const entry of payload?.entries ?? []) {
    if (!entry?.path) continue
    const list = (entry.decorations ?? []).map(fromHostDecoration)
    setDecorations(sourceId, entry.path, list)
  }
}

export interface ExtensionHostBridgeHandle {
  dispose(): void
}

/**
 * Conecta el puente. Se llama UNA vez (desde el boot de extensiones).
 * Sin puente nativo (tests, SSR) no hace nada.
 */
export function initExtensionHostBridge(): ExtensionHostBridgeHandle {
  const host = window.api?.extensions?.host
  if (!host) {
    return { dispose: () => undefined }
  }

  const unsubscribeInvoke = host.onInvoke((request) => {
    void handleInvoke(request).then(
      (result) => host.respondInvoke({ invokeId: request.invokeId, result }),
      (error: unknown) =>
        host.respondInvoke({
          invokeId: request.invokeId,
          error: error instanceof Error ? error.message : String(error)
        })
    )
  })

  const unsubscribeEvents = host.onEvent(handleHostEvent)
  // Recién AHORA el main puede mandar peticiones: antes no había quién
  // contestara y el host se comía un timeout mudo.
  host.signalReady()

  return {
    dispose(): void {
      unsubscribeInvoke()
      unsubscribeEvents()
    }
  }
}

/** Re-export para el boot: deja claro que los documentos van por acá también. */
export type { DocumentEvent }
export type { StatusBarItemModel }
