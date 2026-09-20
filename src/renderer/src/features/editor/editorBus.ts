/**
 * File-tabs del editor — estado de los archivos abiertos (store externo).
 *
 * El container de tabs del área central solo muestra "Bienvenida" y los
 * archivos abiertos. Cualquier parte de la app abre un archivo con
 * openFileInEditor(); aquí se agrega a openFiles + se activa. EditorPanel
 * consume activePath para cargar el contenido en Innerta; Tabs consume
 * openFiles para dibujar el strip.
 *
 * El estado se persiste en localStorage via @services/storage en cada
 * mutación y se restaura en la inicialización del módulo.
 */

import {
  getPersistedEditorOpenFiles,
  getPersistedEditorActivePath,
  persistEditorOpenFiles,
  persistEditorActivePath
} from '@services/storage'

export interface EditorFileTab {
  path: string
  name: string
}

export interface EditorFilesState {
  openFiles: EditorFileTab[]
  /** Path del archivo activo (null = sin archivo activo, se ve Bienvenida). */
  activePath: string | null
}

type FilesListener = (state: EditorFilesState) => void

const state: EditorFilesState = {
  openFiles: getPersistedEditorOpenFiles(),
  activePath: getPersistedEditorActivePath()
}

const listeners = new Set<FilesListener>()

function emit(): void {
  // Persistir en cada cambio
  persistEditorOpenFiles(state.openFiles)
  persistEditorActivePath(state.activePath)

  const snapshot: EditorFilesState = {
    openFiles: [...state.openFiles],
    activePath: state.activePath
  }
  for (const listener of listeners) {
    try {
      listener(snapshot)
    } catch {
      // Un suscriptor roto no debe tumbar a los demás.
    }
  }
}

/** Pide abrir un archivo en el editor (single-click del explorer, etc.). */
export function openFileInEditor(path: string, name: string): void {
  if (!state.openFiles.some((file) => file.path === path)) {
    state.openFiles.push({ path, name })
  }
  state.activePath = path
  emit()
}

/** Cierra un archivo; si era el activo, activa el vecino (o ninguno). */
export function closeFile(path: string): void {
  const index = state.openFiles.findIndex((file) => file.path === path)
  if (index === -1) return
  state.openFiles.splice(index, 1)
  if (state.activePath === path) {
    state.activePath = state.openFiles[Math.min(index, state.openFiles.length - 1)]?.path ?? null
  }
  emit()
}

/** Activa un archivo ya abierto (click en su tab). */
export function activateFile(path: string): void {
  if (state.activePath === path) return
  state.activePath = path
  emit()
}

/** Desactiva el archivo activo (click en Bienvenida): solo una tab queda activa. */
export function clearActiveFile(): void {
  if (state.activePath === null) return
  state.activePath = null
  emit()
}

/** Reordena openFiles (drag de tabs). `from`/`to` son índices DENTRO de openFiles. */
export function moveFileTab(from: number, to: number): void {
  if (from < 0 || to < 0 || from >= state.openFiles.length || to >= state.openFiles.length) return
  if (from === to) return
  const [moved] = state.openFiles.splice(from, 1)
  state.openFiles.splice(to, 0, moved)
  emit()
}

/**
 * Reordena openFiles a un orden dado (drag de tabs en el strip central):
 * las rutas dadas quedan en ese orden y el resto (archivos abiertos en
 * otros strips) se mantiene al final conservando su orden relativo.
 */
export function reorderOpenFilesTo(pathsInOrder: string[]): void {
  const remaining = state.openFiles.filter((file) => !pathsInOrder.includes(file.path))
  const ordered: EditorFileTab[] = []
  for (const path of pathsInOrder) {
    const file = state.openFiles.find((f) => f.path === path)
    if (file) ordered.push(file)
  }
  const next = [...ordered, ...remaining]
  if (next.length !== state.openFiles.length) return
  const same = next.every((file, index) => state.openFiles[index]?.path === file.path)
  if (same) return
  state.openFiles = next
  emit()
}

/** Snapshot actual. */
export function getEditorFiles(): EditorFilesState {
  return { openFiles: [...state.openFiles], activePath: state.activePath }
}

/** Se suscribe a cambios del estado de file-tabs. Devuelve un unsubscribe. */
export function subscribeToEditorFiles(listener: FilesListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}