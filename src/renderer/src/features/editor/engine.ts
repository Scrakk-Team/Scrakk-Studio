import { InnertaEngine } from './engines/innerta/InnertaEngine'

/** Único motor de edición: Innerta Engine (ITE), compilado a WASM. */
export type EditorEngineId = 'InnertaEngine'

/**
 * Contrato del motor de edición.
 *
 * El editor del IDE es un contenedor modular: el Panel no sabe cómo dibuja el
 * motor. InnertaEngine (compilado a WASM) implementa esta interfaz y se
 * inyecta en el host. El engine NO se reescribe: solo el build (emscripten)
 * + este puente sobre su API C (InitInnerta / SetInnertaContent / InnertaFrame…).
 */
export interface EditorEngine {
  readonly id: EditorEngineId
  /** Mensaje de estado del motor (p. ej. "Innerta WASM no compilado aún"). */
  readonly statusText?: string
  /** Monta el motor dentro del host y arranca a renderizar. */
  attach(host: HTMLElement): void
  /** Reemplaza todo el contenido del buffer. */
  setContent(text: string): void
  /** Abre un archivo: nombre para el chrome + contenido cargado por la app. */
  loadFile(path: string, content: string): void
  focus(): void
  /** Pausa el render (el buffer/módulo persisten). */
  dispose(): void
  /** Destrucción total (libera el módulo). Opcional: por defecto no-op. */
  destroy?(): void
  /** Texto completo del buffer activo (undefined si el engine no lo expone aún). */
  getText?(): string | undefined
  /** Bytes del heap WASM (medición real de RAM del editor). */
  heapBytes?(): number | undefined

  // ── Revisión / dirty (flujo de guardado; opcional por builds viejos) ────
  /** Contador monótono de mutaciones del buffer (fuente del dirty). */
  getRevision?(): number | undefined
  /** Revisión confirmada en disco tras un save exitoso. */
  setCleanRevision?(revision: number): void
  /** Estado dirty actual (revision != cleanRevision). */
  isDirty?(): boolean
  /** Cambios de revisión (coalescidos por frame desde el engine). */
  onRevision?(cb: (revision: number) => void): () => void
  /** Cambios dirty (punto en tab, guardia de cierre). */
  onDirty?(cb: (dirty: boolean) => void): () => void
}

/** Clave donde Settings persiste el motor elegido. */
export const EDITOR_ENGINE_STORAGE_KEY = 'editorEngine'

/** Lee el motor persistido (siempre InnertaEngine en la práctica). */
export function getStoredEngine(): EditorEngineId {
  return 'InnertaEngine'
}

/** Fábrica de motores. */
export function createEditorEngine(): EditorEngine {
  return new InnertaEngine()
}

/**
 * Fábrica de motores AISLADOS (multi-editor): cada archivo abierto monta su
 * propia instancia Innerta (módulo WASM + canvas + rAF propios), así las
 * tabs de archivo conservan estado aunque haya varios editores visibles.
 */
export function createIsolatedEditorEngine(): EditorEngine {
  return new InnertaEngine({ isolated: true })
}

/**
 * Instancia única del motor: el canvas y el módulo WASM sobreviven a
 * remounts del panel (tabs Welcome ↔ archivos). Recrear el engine en cada
 * montaje desincronizaba canvas/módulo → clicks fantasma.
 */
let storedInnertaEngine: InnertaEngine | null = null

export function getOrCreateInnertaEngine(): EditorEngine {
  if (!storedInnertaEngine) {
    storedInnertaEngine = new InnertaEngine()
  }
  return storedInnertaEngine
}