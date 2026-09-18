/**
 * Servers LSP APAGADOS por el usuario (persistido en el renderer).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ LA DECISIÓN VIVE ACÁ Y SE EMPUJA
 *
 * El `LspManager` es del main y no tiene storage propio: la preferencia se
 * guarda donde vive el resto de los ajustes del usuario (localStorage) y se
 * EMPUJA al main al arrancar y en cada cambio. El manager la aplica en su
 * único camino de arranque (`startClient`), así que un server apagado no
 * arranca de verdad: no es un adorno visual del panel de Ajustes.
 *
 * Si el push falla (main sin puente, tests) el estado local queda igual: la
 * preferencia del usuario no se pierde por un error de transporte.
 */

import { lsGet, lsSet } from '@services/storage'

const STORAGE_KEY = 'scrakk-studio:lsp:disabled-servers'

let disabled = load()
const listeners = new Set<() => void>()

function load(): string[] {
  try {
    const saved = lsGet<unknown>(STORAGE_KEY)
    if (!Array.isArray(saved)) return []
    return saved.filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return []
  }
}

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Un suscriptor roto no tumba a los demás.
    }
  }
}

/** Empuja la lista al main (idempotente; se llama al arrancar y al cambiar). */
function push(): void {
  void window.api?.lsp?.setDisabledServers?.(disabled)?.catch?.(() => undefined)
}

/** Ids apagados ahora mismo. */
export function getDisabledServers(): string[] {
  return [...disabled]
}

export function isServerDisabled(id: string): boolean {
  return disabled.includes(id)
}

/** Apaga/enciende un server. Persiste, avisa a la UI y al main. */
export function setServerDisabled(id: string, value: boolean): void {
  const has = disabled.includes(id)
  if (value === has) return
  disabled = value ? [...disabled, id] : disabled.filter((candidate) => candidate !== id)
  try {
    lsSet(STORAGE_KEY, disabled)
  } catch {
    // Sin storage: la preferencia vale para esta sesión.
  }
  emit()
  push()
}

export function subscribeToDisabledServers(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Sincroniza el main con lo que el usuario ya había apagado.
 * Se llama UNA vez al arrancar la app (antes de abrir archivos).
 */
export function initDisabledServers(): void {
  if (!window.api?.lsp?.setDisabledServers) return
  push()
}

/** Solo tests: vuelve al estado vacío. */
export function _resetDisabledServersForTests(): void {
  disabled = []
  listeners.clear()
}
