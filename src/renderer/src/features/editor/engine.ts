// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

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

/**
 * Motor COMPARTIDO por panel (strip del centro).
 *
 * Todos los archivos abiertos en un panel viven en el MISMO módulo, cada uno
 * como una sesión con su estado completo (texto, undo, cursor, scroll, folds).
 * Cambiar de tab activa otra sesión: sin instanciar un módulo por archivo
 * (patrón de un editor real, p. ej. Zed). El número de módulos pasa a ser
 * "uno por panel visible", no "uno por archivo abierto".
 *
 * AISLADO a propósito: cada panel necesita su PROPIO módulo WASM + canvas. El
 * loader no aislado (`getInnertaModule`) es singleton (un canvas global), así
 * que dos paneles compartirían módulo y el segundo quedaría vacío.
 */
const paneEngines = new Map<string, InnertaEngine>()

export function getOrCreatePaneEngine(paneId: string): InnertaEngine {
  let engine = paneEngines.get(paneId)
  if (!engine) {
    engine = new InnertaEngine({ isolated: true })
    paneEngines.set(paneId, engine)
  }
  return engine
}

/** Motores de panel vivos (para métricas de memoria de Ajustes). */
export function listPaneEngines(): InnertaEngine[] {
  return [...paneEngines.values()]
}

/**
 * Libera el motor de un panel si ya no le quedan sesiones (al mover la última
 * tab fuera de ese panel, o al cerrarla): sin esto cada panel visitado dejaba
 * su módulo WASM + contexto GL vivos para siempre.
 */
export function releasePaneEngineIfEmpty(paneId: string): void {
  const engine = paneEngines.get(paneId)
  if (!engine) return
  if (engine.hasFileSessions()) return
  engine.destroy?.()
  paneEngines.delete(paneId)
}