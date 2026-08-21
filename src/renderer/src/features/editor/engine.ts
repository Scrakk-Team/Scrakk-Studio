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
  dispose(): void
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