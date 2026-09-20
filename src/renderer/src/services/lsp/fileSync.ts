/**
 * Sincronización EN VIVO del buffer del editor con los language servers.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL BUG QUE ESTO ARREGLA
 *
 * `lspNotifyFileChanged` existía y funcionaba, pero nadie lo llamaba al
 * TIPEAR: el único aviso salía al ABRIR el archivo (y al formatear). O sea que
 * el server conocía el archivo tal como estaba en disco al abrirlo, y después
 * era ciego.
 *
 * Consecuencia medida: escribes `color: ;` en un `.css` y no pasa nada — ni
 * subrayado, ni conteo en el chip de Problemas — porque el server nunca supo
 * que el documento cambió. El hover sí seguía andando (esa request lleva el
 * texto del buffer), así que el síntoma era confusísimo: "el LSP anda, el
 * hover anda, pero no marca ningún error".
 *
 * El Extension Host ya tenía este sync (`services/extensions/documents.ts`);
 * el LSP no. Éste es el equivalente, con la misma forma:
 *
 *   pestaña abierta → sesión de archivo → onDidChangeContent (debounced) → LSP
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ ASÍ
 *
 * - **Texto COMPLETO, no diffs.** El editor es un módulo WASM aislado y sacar
 *   un diff de ahí no es gratis; el `LspClient` del main ya calcula el cambio
 *   incremental cuando el server lo soporta (`computeIncrementalChange`). El
 *   renderer manda el estado, no la diferencia.
 * - **Ventana de 40 ms con leading edge, no un debounce de 250 ms.** Un
 *   debounce clásico espera a que DEJES de tipear: la última tecla de una
 *   palabra quedaba 250 ms en el aire antes de que el server supiera nada.
 *   Aquí la primera edición de una ráfaga sale **ya** (0 ms) y lo que se agrupa
 *   es el resto: nunca pasan más de 40 ms entre el buffer y el server, con el
 *   mismo objetivo de no mandar un `didChange` por tecla.
 *   Medido con `tools/_probe-lsp-realtime.mjs`: 740 ms → ver el probe.
 * - **Dedupe por texto.** Una revisión puede llegar sin que cambie el texto
 *   (un `setContent` idéntico, una recreación de módulo): re-lintear por eso
 *   haría parpadear el subrayado sin motivo.
 * - **Una suscripción por archivo abierto** (no sólo la tab activa): un server
 *   ve TODOS los documentos abiertos, y los diagnósticos de un archivo de
 *   fondo tienen que seguir actualizándose.
 * - **Cerrar la tab = `didClose`.** Sin eso el server sigue creyendo que el
 *   documento está abierto y sus diagnósticos quedan como fantasmas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * No conoce Electron ni el motor de render: consume `onDidChangeContent` de la
 * sesión de archivo (texto plano) y llama a `lspNotifyFileChanged`. Si Owear
 * cambia el editor, cambia quién emite ese evento, no esto.
 */

import { getEditorFiles, getFileSession, subscribeToEditorFiles } from '@features/editor'
import { lspNotifyFileChanged, lspNotifyFileClosed } from './api'

/**
 * Ventana de agrupado entre ediciones. NO es un debounce: no se reinicia con
 * cada tecla, así que una ráfaga continua sale cada 40 ms en vez de esperar a
 * que el usuario se detenga.
 */
const CHANGE_COALESCE_MS = 40

/** Reloj monotónico (los tests lo controlan con fake timers sobre `Date`). */
const nowMs = (): number => Date.now()

/** Cómo se habla con el LSP (una sola puerta, para poder testearla). */
export interface LspFileSyncSink {
  notify(path: string, content: string): void | Promise<void>
  close(path: string): void | Promise<void>
}

const defaultSink: LspFileSyncSink = {
  notify: (path, content) => lspNotifyFileChanged(path, content),
  close: (path) => lspNotifyFileClosed(path)
}

export interface LspFileSyncHandle {
  /** Empuja lo pendiente YA (tests, o cerrar la app sin perder el último estado). */
  flush(): void
  dispose(): void
}

interface TrackedFile {
  path: string
  /** Último texto ENVIADO: si no cambió, no se manda otro `didChange`. */
  lastText: string | null
  unsubscribeContent: () => void
}

/**
 * Arranca el sync. Idempotente desde el punto de vista del llamador: se llama
 * una vez en `main.tsx`.
 *
 * Si una sesión todavía no tiene módulo WASM montado no hay buffer que mandar
 * (su tab nunca se abrió): el `didOpen` de ese caso lo hace la carga del
 * archivo, que lee de disco. Cuando la tab se monte, la primera emisión de
 * `onDidChangeContent` trae el texto y entra por aquí.
 */
export function initLspFileSync(sink: LspFileSyncSink = defaultSink): LspFileSyncHandle {
  const tracked = new Map<string, TrackedFile>()
  /** Cambios pendientes de mandar: ruta → texto. */
  const pending = new Map<string, string>()
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  /** Cuándo se mandó lo último (0 = todavía nada). */
  let lastFlushAt = 0
  let disposed = false

  function flush(): void {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    if (pending.size === 0) return
    const batch = [...pending.entries()]
    pending.clear()
    lastFlushAt = nowMs()
    for (const [path, text] of batch) {
      try {
        void sink.notify(path, text)
      } catch {
        // Un server que no contesta no puede frenar al resto de los archivos.
      }
    }
  }

  /**
   * Manda YA si hace rato que no sale nada; si no, agrupa lo que falta de la
   * ventana. El primer cambio después de una pausa tiene latencia CERO y una
   * ráfaga continua sale como máximo cada `CHANGE_COALESCE_MS`.
   */
  function scheduleFlush(): void {
    if (flushTimer) return
    const waited = lastFlushAt === 0 ? CHANGE_COALESCE_MS : nowMs() - lastFlushAt
    if (waited >= CHANGE_COALESCE_MS) {
      flush()
      return
    }
    flushTimer = setTimeout(flush, CHANGE_COALESCE_MS - waited)
  }

  function track(path: string): void {
    const entry: TrackedFile = { path, lastText: null, unsubscribeContent: () => undefined }
    tracked.set(path, entry)
    const session = getFileSession(path)
    entry.unsubscribeContent = session.onDidChangeContent((text) => {
      if (disposed) return
      if (text === entry.lastText) return
      entry.lastText = text
      pending.set(path, text)
      scheduleFlush()
    })
  }

  function forget(path: string): void {
    const entry = tracked.get(path)
    if (!entry) return
    entry.unsubscribeContent()
    tracked.delete(path)
    pending.delete(path)
    try {
      void sink.close(path)
    } catch {
      // Igual que arriba: el cierre de uno no tumba a los demás.
    }
  }

  /** Declara los archivos abiertos que todavía no se siguen, y suelta los cerrados. */
  function syncOpenFiles(): void {
    const present = new Set(getEditorFiles().openFiles.map((file) => file.path))
    for (const path of [...tracked.keys()]) {
      if (!present.has(path)) forget(path)
    }
    for (const path of present) {
      if (!tracked.has(path)) track(path)
    }
  }

  const unsubscribeFiles = subscribeToEditorFiles(() => {
    if (disposed) return
    syncOpenFiles()
  })

  // Estado inicial: el editor persiste las tabs, así que al arrancar puede
  // haber archivos abiertos (y sus cambios de fondo deben sincronizarse).
  syncOpenFiles()

  return {
    flush,
    dispose(): void {
      disposed = true
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = null
      unsubscribeFiles()
      for (const entry of tracked.values()) entry.unsubscribeContent()
      tracked.clear()
      pending.clear()
    }
  }
}

/**
 * Avisa que un archivo se GUARDÓ.
 *
 * Va aparte del flujo de contenido porque guardar no cambia el buffer: sin
 * esto, un server que sólo valida al save (`didSave`) nunca se enteraba del
 * guardado y sus diagnósticos no aparecían hasta reabrir el archivo.
 */
export async function notifyLspDocumentSaved(path: string): Promise<void> {
  const session = getFileSession(path)
  const text = session.getText?.()
  if (typeof text !== 'string') return
  try {
    await lspNotifyFileChanged(path, text)
  } catch {
    // Sin LSP (o server caído): guardar no depende de esto.
  }
}
