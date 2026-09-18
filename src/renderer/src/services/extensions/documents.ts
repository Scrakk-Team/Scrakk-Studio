/**
 * Sincronización de documentos: editor → Extension Host.
 *
 * Es la fuente de `workspace.textDocuments` en las extensiones. Sin esto, una
 * extensión de paneles activa pero CIEGA: el árbol de Comment Anchors se
 * quedaba en "Searching for anchors…" para siempre porque no había ni un
 * documento que mirar (medido en la app real).
 *
 * Qué se manda y por qué:
 *  - `open`: el archivo entró al strip de tabs. Se manda cuando el BUFFER está
 *    listo (la sesión carga el texto de forma asíncrona), así la extensión
 *    nunca ve un documento vacío que después se llena.
 *  - `change`: el buffer cambió. Va el texto COMPLETO (no diffs): el editor es
 *    un módulo WASM aislado y sacar un diff incremental de ahí no es gratis,
 *    mientras que el texto se lee igual para el LSP. Con debounce, para no
 *    mandar un string gigante por tecla.
 *  - `save`, `close`, `active`: tal cual lo que pide el API de VS Code.
 *
 * Se registra UNA vez (desde el boot de extensiones). Si no hay host vivo, el
 * main igual guarda el estado y se lo siembra al host que arranque después.
 */

import { getEditorFiles, getFileSession, subscribeToEditorFiles } from '@features/editor'
import { detectLanguageFromPath } from '@features/editor/languages'
import { getEditorCursor, subscribeToEditorCursor } from '@features/editor/cursorBus'
import { readEncoded } from '@services/encodings'
import type {
  DocumentEvent,
  DocumentSelection,
  DocumentSnapshot
} from '@shared/extensionHost/protocol'

/** Cómo se escribe un documento (una sola puerta, para poder testearla). */
export interface DocumentSink {
  send(events: DocumentEvent[]): void
}

const defaultSink: DocumentSink = {
  send: (events) => {
    try {
      window.api?.extensions?.host?.syncDocuments(events)
    } catch {
      // Sin puente (tests): no hay nada que sincronizar.
    }
  }
}

/** Debounce de los cambios de buffer (una ráfaga de tipeo = un envío). */
const CHANGE_DEBOUNCE_MS = 120

interface OpenDocument {
  path: string
  /** Versión propia, MONÓTONA: la del módulo se reinicia al recrear el engine. */
  version: number
  /** Emitió el `open` inicial (el buffer ya tiene texto). */
  announced: boolean
  /** Último texto enviado: si no cambió, no se manda otro `change`. */
  lastText: string | null
  unsubscribeContent: () => void
}

export interface ExtensionDocumentsHandle {
  /** Fuerza el envío de lo que está pendiente (tests / cerrar la app). */
  flush(): void
  dispose(): void
}

function languageIdOf(path: string): string {
  return detectLanguageFromPath(path) ?? 'plaintext'
}

function snapshotOf(path: string, text: string, dirty: boolean, version: number): DocumentSnapshot {
  return {
    path,
    languageId: languageIdOf(path),
    text,
    version,
    dirty,
    eol: text.includes('\r\n') ? '\r\n' : '\n'
  }
}

/**
 * Empieza a sincronizar. Devuelve un handle para cortar la suscripción
 * (tests, o reemplazar el sink).
 */
export function initExtensionDocuments(sink: DocumentSink = defaultSink): ExtensionDocumentsHandle {
  const open = new Map<string, OpenDocument>()
  /** Cambios pendientes de mandar, por path. */
  const pending = new Map<string, DocumentSnapshot>()
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  function flush(): void {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    if (pending.size === 0) return
    const events: DocumentEvent[] = []
    for (const document of pending.values()) events.push({ kind: 'change', document })
    pending.clear()
    sink.send(events)
  }

  function scheduleFlush(): void {
    if (flushTimer) return
    flushTimer = setTimeout(flush, CHANGE_DEBOUNCE_MS)
  }

  function currentSelection(): DocumentSelection | undefined {
    const cursor = getEditorCursor()
    if (!cursor) return undefined
    const position = { line: cursor.line, character: cursor.col }
    return { start: position, end: position }
  }

  /**
   * Anuncia un documento leyéndolo del DISCO.
   *
   * Camino para un archivo que está abierto en el strip pero cuya tab nunca se
   * montó: sin módulo WASM no hay buffer, y el texto hay que leerlo igual (una
   * extensión que cuenta cosas del workspace necesita ver TODO lo abierto, no
   * sólo la tab enfocada).
   */
  function announceFromDisk(path: string, entry: OpenDocument): void {
    if (entry.announced) return
    void readEncoded(path)
      .then((result) => {
        if (disposed || entry.announced) return
        if (!result.success || typeof result.text !== 'string') return
        entry.announced = true
        entry.version += 1
        entry.lastText = result.text
        sink.send([{ kind: 'open', document: snapshotOf(path, result.text, false, entry.version) }])
      })
      .catch(() => {
        // No se pudo leer: el documento simplemente no se anuncia.
      })
  }

  /** Sigue un documento: el `open` sale cuando el buffer tiene contenido. */
  function trackDocument(path: string): OpenDocument {
    const session = getFileSession(path)
    const entry: OpenDocument = {
      path,
      version: 0,
      announced: false,
      lastText: null,
      unsubscribeContent: () => undefined
    }

    // Si su tab no está montada todavía no hay buffer: se lee de disco. Si el
    // módulo YA está vivo, el callback de abajo emite el texto y esto no corre.
    if (!session.hasLiveModule()) announceFromDisk(path, entry)

    entry.unsubscribeContent = session.onDidChangeContent((text) => {
      if (disposed) return
      entry.version += 1
      const document = snapshotOf(path, text, session.isDirty(), entry.version)

      if (!entry.announced) {
        entry.announced = true
        entry.lastText = text
        sink.send([{ kind: 'open', document }])
        return
      }
      if (text === entry.lastText) return
      entry.lastText = text
      pending.set(path, document)
      scheduleFlush()
    })

    return entry
  }

  function forget(path: string): void {
    const entry = open.get(path)
    if (!entry) return
    entry.unsubscribeContent()
    open.delete(path)
    pending.delete(path)
    // Si nunca se anunció, el host no lo conoce: no hay nada que cerrar.
    if (entry.announced) sink.send([{ kind: 'close', path }])
  }

  /** Declara los archivos abiertos que todavía no siguen sincronizados. */
  function syncOpenFiles(): void {
    const present = new Set(getEditorFiles().openFiles.map((file) => file.path))
    for (const path of [...open.keys()]) {
      if (!present.has(path)) forget(path)
    }
    for (const path of present) {
      if (!open.has(path)) open.set(path, trackDocument(path))
    }
  }

  function sendActive(): void {
    const { activePath } = getEditorFiles()
    sink.send([
      {
        kind: 'active',
        path: activePath,
        selection: activePath ? currentSelection() : undefined
      }
    ])
  }

  const unsubscribeFiles = subscribeToEditorFiles(() => {
    if (disposed) return
    syncOpenFiles()
    sendActive()
  })

  const unsubscribeCursor = subscribeToEditorCursor(() => {
    if (disposed) return
    sendActive()
  })

  // Estado inicial: el editor persiste las tabs, así que al arrancar puede
  // haber archivos abiertos (y el host debe verlos antes de activar).
  syncOpenFiles()
  sendActive()

  return {
    flush,
    dispose(): void {
      disposed = true
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = null
      unsubscribeFiles()
      unsubscribeCursor()
      for (const entry of open.values()) entry.unsubscribeContent()
      open.clear()
      pending.clear()
    }
  }
}

/**
 * Avisa que un documento se GUARDÓ (lo llama `saveFileByPath`).
 * Va aparte del flujo de contenido porque guardar no cambia el buffer.
 */
export function notifyDocumentSaved(path: string): void {
  const session = getFileSession(path)
  const revision = session.getRevision()
  const text = session.getText()
  if (typeof revision !== 'number' || typeof text !== 'string') return
  try {
    window.api?.extensions?.host?.syncDocuments([
      { kind: 'save', path, version: revision },
      { kind: 'change', document: snapshotOf(path, text, false, revision + 1) }
    ])
  } catch {
    // Sin puente: nada que avisar.
  }
}
