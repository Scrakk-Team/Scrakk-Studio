/**
 * Sesiones de archivo (multi-editor).
 *
 * Cada archivo abierto tiene UNA sesión con su propio engine Innerta
 * AISLADO (módulo WASM + canvas + rAF). La sesión sobrevive a attach/detach
 * (mover la tab entre slots, o dejarla inactiva en el strip): el buffer,
 * undo y scroll del archivo quedan en su módulo, pausado. Se destruye al
 * cerrar la tab — o antes por LRU si hay demasiados módulos en background
 * (evicción con snapshot de texto; solo se pierde el undo).
 *
 * Es la base del flujo nuevo de tabs: el strip central deriva sus tabs de
 * editorBus; cada tab de archivo (en cualquier slot) renderiza su sesión.
 */

import type { EditorEngine } from './engine'
import { createIsolatedEditorEngine } from './engine'
import { readEncoded, setDetected } from '@services/encodings'
import { lspNotifyFileChanged } from '@services/lsp'
import { notify } from '@services/notifications'
import { isLowEndMode } from '@services/perf'

export interface FileSession {
  readonly path: string
  /** Monta el canvas de la sesión en el host (crea el engine la 1ª vez). */
  attach(host: HTMLElement): void
  /**
   * Pausa (tab inactiva / movida): el engine conserva buffer y undo. Recibe
   * el host que se desmonta para ignorar cleanups STALE (corren después de
   * un attach a otro host al mover la tab de panel).
   */
  detach(host?: HTMLElement): void
  /** Destruye el engine (cerrar la tab): libera el módulo WASM. */
  destroy(): void
  /** Buffer actual del engine (para guardar). undefined si no está listo. */
  getText(): string | undefined
  /** Revisión actual del buffer (undefined si el módulo no está listo). */
  getRevision(): number | undefined
  /** ¿El buffer difiere de lo persistido? (lectura exacta on demand). */
  isDirty(): boolean
  /** Revisión confirmada en disco tras un save exitoso. */
  markClean(revision: number): void
  /**
   * ¿La sesión tiene un módulo WASM vivo? (false = todavía no se montó su tab,
   * así que su buffer no existe y hay que leer el texto de disco si se quiere
   * conocer el contenido — lo usa la sincronización con el Extension Host).
   */
  hasLiveModule(): boolean
  /** Cambios de dirty (punto en tab / guardia de cierre). */
  onDidChangeDirty(cb: (dirty: boolean) => void): () => void
  /**
   * Cambios de CONTENIDO (cada revisión del buffer, con el texto completo).
   *
   * Lo usa la sincronización con el Extension Host (`workspace.textDocuments`):
   * las extensiones necesitan el texto del archivo abierto. Al suscribirse se
   * emite YA el contenido actual si el archivo terminó de cargar (si todavía
   * no, la primera emisión es la carga).
   */
  onDidChangeContent(cb: (text: string, revision: number) => void): () => void
}

class FileSessionImpl implements FileSession {
  readonly path: string
  private engine: EditorEngine | null = null
  private loaded = false
  private loading = false
  /** Host del attach actual (para ignorar detaches stale). */
  private host: HTMLElement | null = null

  /** Snapshot de buffer tras evicción LRU (rehidrata sin disco). */
  private evictedText: string | null = null

  // ── Dirty (estado de la SESIÓN, no del módulo: sobrevive a la evicción
  // LRU, que destruye el engine y reinicia su contador de revisión) ────────
  /** Revisión confirmada en disco. null hasta la primera carga. */
  private cleanRevision: number | null = null
  /**
   * Qué hacer con la primera revisión que llegue tras una carga: 'clean'
   * (contenido = disco) o 'dirty' (snapshot evictado con cambios — clean
   * queda 1 por debajo para que el módulo nuevo reporte dirty).
   */
  private pendingInitialClean: 'clean' | 'dirty' | null = null
  private dirty = false
  private dirtyListeners = new Set<(dirty: boolean) => void>()
  private contentListeners = new Set<(text: string, revision: number) => void>()
  private unsubRevision: (() => void) | null = null

  constructor(path: string) {
    this.path = path
  }

  attach(host: HTMLElement): void {
    this.host = host
    // Vuelve a primer plano: sale de la lista LRU de background.
    removeFromBackground(this.path)
    if (!this.engine) {
      this.engine = createIsolatedEditorEngine()
      this.subscribeEngine()
      this.engine.attach(host)
      void this.load()
    } else {
      this.engine.attach(host)
    }
  }

  private subscribeEngine(): void {
    this.unsubRevision?.()
    this.unsubRevision = null
    this.unsubRevision =
      this.engine?.onRevision?.((rev) => {
        if (this.pendingInitialClean === 'clean') {
          this.cleanRevision = rev
        } else if (this.pendingInitialClean === 'dirty') {
          this.cleanRevision = Math.max(0, rev - 1)
        }
        if (this.pendingInitialClean !== null) this.pendingInitialClean = null
        this.recomputeDirty(rev)
        this.emitContent(rev)
      }) ?? null
  }

  /**
   * Avisa a los suscriptores del contenido. Leer el buffer del módulo WASM no
   * es gratis, así que NO se hace si nadie escucha (caso normal: sin
   * extensiones de código no hay un solo suscriptor).
   */
  private emitContent(revision: number): void {
    if (this.contentListeners.size === 0) return
    const text = this.engine?.getText?.()
    if (typeof text !== 'string') return
    for (const listener of [...this.contentListeners]) {
      try {
        listener(text, revision)
      } catch {
        // Un listener roto no tumba la sesión.
      }
    }
  }

  private recomputeDirty(revision?: number): void {
    const rev = revision ?? this.engine?.getRevision?.()
    if (typeof rev !== 'number' || this.cleanRevision === null) return
    this.setDirty(rev !== this.cleanRevision)
  }

  private setDirty(dirty: boolean): void {
    if (dirty === this.dirty) return
    this.dirty = dirty
    for (const cb of this.dirtyListeners) {
      try {
        cb(dirty)
      } catch {
        // Un listener roto no tumba la sesión.
      }
    }
  }

  private async load(): Promise<void> {
    const engine = this.engine
    if (!engine || this.loading) return
    // Snapshot de una evicción LRU: va PRIMERO (loaded quedó en true al
    // evictar para no re-leer disco; el snapshot es el estado a restaurar).
    // El buffer en memoria prevalece (incluye cambios sin guardar). Sin
    // re-lectura de disco ni re-notify LSP (el archivo nunca se cerró ahí).
    if (this.evictedText !== null) {
      const text = this.evictedText
      this.evictedText = null
      this.loaded = true
      // El contador del módulo nuevo arranca en 0: sincronizar el dirty de
      // la SESIÓN (clean = revisión actual si estaba limpio, o 1 por debajo
      // si venía con cambios sin guardar).
      this.pendingInitialClean = this.dirty ? 'dirty' : 'clean'
      engine.loadFile(this.path, text)
      return
    }
    if (this.loaded) return
    this.loading = true
    try {
      // Lectura con detección de encoding (BOM/UTF-16/Latin-1 → texto), igual
      // que el EditorPanel legacy. Se lee UNA vez por sesión: al pausar y
      // reanudar la tab, el buffer del engine (con los cambios sin guardar)
      // prevalece sobre el disco.
      const res = await readEncoded(this.path)
      if (!res.success || typeof res.text !== 'string' || !res.detected) return
      if (!this.engine) return
      setDetected(this.path, res.text, res.detected)
      this.loaded = true
      this.pendingInitialClean = 'clean'
      this.cleanRevision = null
      this.setDirty(false)
      engine.loadFile(this.path, res.text)
      void lspNotifyFileChanged(this.path, res.text)
    } catch {
      // Lectura fallida: el engine queda con su buffer vacío.
    } finally {
      this.loading = false
    }
  }

  detach(host?: HTMLElement): void {
    // Detach STALE: el cleanup del host viejo puede correr después del attach
    // a otro host (drag de la tab entre slots). No pausar el engine nuevo.
    if (host && this.host && host !== this.host) return
    this.host = null
    this.engine?.dispose()
    trackBackground(this.path)
  }

  destroy(): void {
    removeFromBackground(this.path)
    this.unsubRevision?.()
    this.unsubRevision = null
    this.engine?.destroy?.()
    this.engine = null
    this.loaded = false
    this.evictedText = null
    this.dirtyListeners.clear()
    this.contentListeners.clear()
    sessions.delete(this.path)
  }

  /** Bytes del heap WASM vivo (0 si el módulo no está cargado). */
  heapBytes(): number {
    try {
      return this.engine?.heapBytes?.() ?? 0
    } catch {
      return 0
    }
  }

  /** True si retiene un módulo WASM vivo (aunque esté en background). */
  hasLiveModule(): boolean {
    return this.engine !== null
  }

  /**
   * Evicción LRU: snapshot del buffer + destroy del módulo (heap + GL).
   *
   * El texto se retiene **solo si hay cambios sin guardar** (no se pueden
   * perder). Un archivo limpio se re-lee de disco al reabrir: mismo contenido
   * y sin retener memoria (antes cada archivo abierto guardaba su texto para
   * siempre y el heap del renderer crecía con cada uno).
   *
   * Se pierde el undo de la sesión — documentado: el tope existe para no
   * OOMear en PCs débiles. Devuelve false si no había nada evictable
   * (p. ej. módulo aún cargando).
   */
  evictModule(): boolean {
    const text = this.engine?.getText?.()
    if (typeof text !== 'string') return false
    const dirty = this.isDirty()
    this.evictedText = dirty ? text : null
    this.unsubRevision?.()
    this.unsubRevision = null
    this.engine?.destroy?.()
    this.engine = null
    // Limpio → `loaded=false`: `load()` re-lee de disco. Sucio → true: el
    // snapshot ES el estado a restaurar.
    this.loaded = dirty
    return true
  }

  getText(): string | undefined {
    return this.engine?.getText?.()
  }

  getRevision(): number | undefined {
    return this.engine?.getRevision?.()
  }

  isDirty(): boolean {
    // Lectura exacta on demand: no depende de que hayan llegado eventos.
    const rev = this.engine?.getRevision?.()
    if (typeof rev === 'number' && this.cleanRevision !== null) {
      return rev !== this.cleanRevision
    }
    return this.dirty
  }

  markClean(revision: number): void {
    this.cleanRevision = revision
    this.pendingInitialClean = null
    this.engine?.setCleanRevision?.(revision)
    this.recomputeDirty(revision)
  }

  onDidChangeDirty(cb: (dirty: boolean) => void): () => void {
    this.dirtyListeners.add(cb)
    return () => {
      this.dirtyListeners.delete(cb)
    }
  }

  onDidChangeContent(cb: (text: string, revision: number) => void): () => void {
    this.contentListeners.add(cb)
    // Estado actual (el archivo puede estar cargado y quieto hace rato).
    const revision = this.engine?.getRevision?.()
    const text = this.engine?.getText?.()
    if (typeof revision === 'number' && typeof text === 'string') {
      try {
        cb(text, revision)
      } catch {
        // Un listener roto no tumba la sesión.
      }
    }
    return () => {
      this.contentListeners.delete(cb)
    }
  }

  /** Re-setea el buffer con texto ya re-decodificado (reabrir con encoding). */
  reloadText(text: string): void {
    // El texto viene de disco: la primera revisión que llegue es clean.
    this.pendingInitialClean = 'clean'
    this.cleanRevision = null
    this.setDirty(false)
    this.engine?.loadFile?.(this.path, text)
  }
}

const sessions = new Map<string, FileSessionImpl>()

/** ¿El archivo tiene cambios sin guardar? (false si ni siquiera está abierto). */
export function isFileDirty(path: string): boolean {
  return sessions.get(path)?.isDirty() ?? false
}

/**
 * Tope de módulos WASM vivos en background (tabs visitadas, no visibles).
 * Cada módulo ≈ decenas de MB de heap + 1 contexto GL (límite del browser
 * ~8-16); sin tope, visitar N archivos = N heaps para siempre. Al superar
 * el tope se evicta la sesión más vieja (snapshot de texto, pierde undo).
 * Solo archivos: las terminales no entran aquí. (Fase 6 lo expone en Ajustes.)
 */
const MAX_BACKGROUND_MODULES = 6
/** En modo PC mala el tope baja: 2 módulos de fondo como máximo. */
const MAX_BACKGROUND_MODULES_LOW_END = 2

function backgroundCap(): number {
  return isLowEndMode() ? MAX_BACKGROUND_MODULES_LOW_END : MAX_BACKGROUND_MODULES
}

/** Paths con módulo vivo en background, en orden LRU (más viejo primero). */
const backgroundOrder: string[] = []

function removeFromBackground(path: string): void {
  const at = backgroundOrder.indexOf(path)
  if (at !== -1) backgroundOrder.splice(at, 1)
}

function enforceBackgroundCap(): void {
  const cap = backgroundCap()
  while (backgroundOrder.length > cap) {
    // findIndex detiene en la primera evictable; las que devuelven false
    // (módulo aún cargando) no se mutan y se reintentan en el próximo detach.
    const idx = backgroundOrder.findIndex((p) => sessions.get(p)?.evictModule() ?? false)
    if (idx === -1) break
    backgroundOrder.splice(idx, 1)
  }
}

/** Recorta al tope vigente AHORA (al activar el modo PC mala en caliente). */
export function applyBackgroundCapNow(): void {
  enforceBackgroundCap()
  checkAggregateHeap()
}

/** Cuántos módulos WASM vivos hay en background (para la UI de Ajustes). */
export function backgroundModuleCount(): number {
  return backgroundOrder.length
}

/** Suma de heaps WASM reales de todas las sesiones (para la UI de Ajustes). */
export function totalEditorHeapBytes(): number {
  let total = 0
  for (const session of sessions.values()) {
    total += session.heapBytes()
  }
  return total
}

function trackBackground(path: string): void {
  const session = sessions.get(path)
  if (!session?.hasLiveModule()) return
  removeFromBackground(path)
  backgroundOrder.push(path)
  enforceBackgroundCap()
  checkAggregateHeap()
}

/**
 * Aviso al 80% del techo de 1 GB sumando heaps reales (HEAP8). Con latch:
 * avisa una vez hasta bajar del 60%. Va por la API de notificaciones de la
 * app (misma que el resto de avisos del IDE). En modo PC mala los umbrales
 * bajan a la mitad.
 */
const HEAP_WARN_BYTES = 800 * 1024 * 1024
const HEAP_WARN_RESET_BYTES = 600 * 1024 * 1024
let heapWarned = false

function heapThresholds(): { warn: number; reset: number } {
  if (isLowEndMode()) return { warn: HEAP_WARN_BYTES / 2, reset: HEAP_WARN_RESET_BYTES / 2 }
  return { warn: HEAP_WARN_BYTES, reset: HEAP_WARN_RESET_BYTES }
}

function checkAggregateHeap(): void {
  let total = 0
  for (const session of sessions.values()) {
    total += session.heapBytes()
  }
  const { warn, reset } = heapThresholds()
  if (total >= warn && !heapWarned) {
    heapWarned = true
    const mb = Math.round(total / (1024 * 1024))
    notify({
      title: 'Memoria del editor alta',
      message: `Los editores usan ~${mb} MB (techo 1 GB por módulo). Cierra archivos que no uses para liberar memoria.`,
      severity: 'warn'
    })
  } else if (total < reset) {
    heapWarned = false
  }
}

/** Sesión viva del archivo (se crea la primera vez que se pide). */
export function getFileSession(path: string): FileSession {
  let session = sessions.get(path)
  if (!session) {
    session = new FileSessionImpl(path)
    sessions.set(path, session)
  }
  return session
}

/** Destruye la sesión de un archivo (al cerrar su tab). */
export function destroyFileSession(path: string): void {
  sessions.get(path)?.destroy()
}

/** ¿Existe sesión viva para el path? (útil para no recrear de más). */
export function hasFileSession(path: string): boolean {
  return sessions.has(path)
}

/** Buffer de la sesión del archivo (para guardar). */
export function getFileSessionText(path: string): string | undefined {
  return sessions.get(path)?.getText()
}

/**
 * Recarga el contenido de la sesión (acción "reabrir con encoding"): si el
 * archivo tiene sesión viva con engine montado, se re-setea su buffer con el
 * texto ya re-decodificado (descartando cambios, que es lo que pide la acción).
 */
export function reloadFileContent(path: string, text: string): void {
  sessions.get(path)?.reloadText(text)
}
