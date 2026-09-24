// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Decoraciones de archivos — API pública del explorer.
 *
 * Estilo VS Code FileDecorationProvider: cualquier módulo registra un
 * proveedor `(absPath) => FileDecoration | null` y las filas del árbol
 * (ExplorerRow, en cualquier panel que spawnee el explorer) pintan el badge
 * encima del archivo. Sin hardcodear orígenes: git, LSP, etc.
 *
 * Patrón del repo: Set<Listener> + emit(). Los consumidores se suscriben
 * para re-render cuando algo cambia (el proveedor lee estado vivo en cada
 * llamada, el registry solo avisa vía refreshFileDecorations()).
 */

export interface FileDecoration {
  /** Letra/símbolo corto (ej. 'M', 'A', '?', 'D'). */
  badge: string
  /** Color CSS (default: texto muteado). */
  color?: string
  /** Tooltip del badge. */
  tooltip?: string
}

export type FileDecorationProvider = (absPath: string) => FileDecoration | null

type Listener = () => void

const providers: FileDecorationProvider[] = []
const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Suscriptor roto no tumba a los demás.
    }
  }
}

export function subscribeToDecorations(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Registra un proveedor (primero registrado = mayor prioridad). Devuelve unsubscribe. */
export function registerFileDecorationProvider(provider: FileDecorationProvider): () => void {
  providers.push(provider)
  emit()
  return () => {
    const index = providers.indexOf(provider)
    if (index !== -1) providers.splice(index, 1)
    emit()
  }
}

/** Primera decoración no-nula (en orden de registro). Null si nadie decora. */
export function getFileDecoration(absPath: string): FileDecoration | null {
  for (const provider of providers) {
    try {
      const decoration = provider(absPath)
      if (decoration) return decoration
    } catch {
      // Proveedor roto: se salta, no tumba la fila.
    }
  }
  return null
}

/** Avisar que las decoraciones cambiaron (re-render de filas). */
export function refreshFileDecorations(): void {
  emit()
}

const FLAG_KEY = 'scrakk-studio:git-decorations'

let gitVisible: boolean | null = null

function loadFlag(): boolean {
  if (gitVisible !== null) return gitVisible
  try {
    gitVisible = typeof localStorage !== 'undefined' && localStorage.getItem(FLAG_KEY) === '1'
  } catch {
    gitVisible = false
  }
  return gitVisible
}

/** ¿Badges de git visibles? Default OFF (se prenden con el botón del header). */
export function isGitDecorationsVisible(): boolean {
  return loadFlag()
}

/** Prende/apaga badges de git (persiste + emite). */
export function setGitDecorationsVisible(visible: boolean): void {
  gitVisible = visible
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FLAG_KEY, visible ? '1' : '0')
    }
  } catch {
    // Sin almacenamiento: solo memoria.
  }
  emit()
}

/** Solo tests: limpia proveedores + listeners. */
export function _resetDecorationsForTests(): void {
  providers.length = 0
  listeners.clear()
}
