/**
 * Visibilidad de la vista de skills DENTRO del panel de chat (mismo patrón
 * que `HistoryPanel/viewState.ts`): es una vista que reemplaza el contenido
 * del chat, no un panel aparte.
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

export function isSkillsViewOpen(): boolean {
  return open
}

export function setSkillsViewOpen(next: boolean): void {
  if (open === next) return
  open = next
  emit()
}

export function toggleSkillsView(): void {
  setSkillsViewOpen(!open)
}

export function subscribeToSkillsView(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Solo tests: vuelve al estado inicial. */
export function _resetSkillsViewForTests(): void {
  open = false
  listeners.clear()
}
