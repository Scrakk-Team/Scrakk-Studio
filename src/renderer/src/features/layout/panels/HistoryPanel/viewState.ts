// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Visibilidad de la vista de historial DENTRO del panel de chat.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ ES UN STORE Y NO UN useState DEL CHAT
 *
 * El historial dejó de ser un panel propio: ahora es una vista que se abre
 * adentro del panel de chat (una columna, como en VS Code). El botón del
 * header vive en el ChatPanel, pero el comando/atajo (`mod+alt+h`) no puede
 * tocar el `useState` de un panel que quizá ni esté montado, así que el flag
 * vive aquí: módulo chico, módulo-level, con el mismo patrón de siempre
 * (Set<Listener> + emit) que el resto de los stores de la app.
 *
 * No se persiste a propósito: es una vista transitoria (misma decisión que el
 * resto de los toggles de vista que no son layout).
 */

type Listener = () => void

let open = false
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

export function isHistoryViewOpen(): boolean {
  return open
}

export function setHistoryViewOpen(next: boolean): void {
  if (open === next) return
  open = next
  emit()
}

export function toggleHistoryView(): void {
  setHistoryViewOpen(!open)
}

export function subscribeToHistoryView(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Solo tests: vuelve al estado inicial. */
export function _resetHistoryViewForTests(): void {
  open = false
  listeners.clear()
}
