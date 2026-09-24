// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Estado enabled/disabled de extensiones.
 *
 * Cada extensión (builtin o usuario) se puede activar/desactivar en vivo
 * desde Ajustes → Extensiones. Desactivar desregistra TODAS sus
 * contribuciones (paneles, botones, tabs, temas, iconos) sin desinstalar;
 * activar vuelve a registrar. El estado persiste en localStorage con
 * fallback en memoria (navegación privada, tests).
 *
 * Por defecto todo está activado: solo se guardan las desactivadas.
 */

export interface DisabledExtensionMeta {
  id: string
  name: string
  version: string
  author?: string
  isBuiltin: boolean
}

const STORAGE_KEY = 'scrakk:disabled-extensions'

type Listener = () => void

/** Solo desactivadas (map id → meta para seguir listándolas). */
let disabled: Record<string, DisabledExtensionMeta> = {}
const listeners = new Set<Listener>()
const memoryFallback = new Map<string, string>()

function emit(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // Un suscriptor roto no debe tumbar a los demás.
    }
  }
}

export function subscribeToEnabled(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function storageGet(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return memoryFallback.get(STORAGE_KEY) ?? null
  }
}

function storageSet(value: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    memoryFallback.set(STORAGE_KEY, value)
  }
}

function persist(): void {
  try {
    storageSet(JSON.stringify({ disabled }))
  } catch {
    // Estado queda solo en memoria esta sesión.
  }
}

/** Hidrata desde almacenamiento (llamar una vez al boot, antes de loaders). */
export function hydrateEnabled(): void {
  try {
    const raw = storageGet()
    if (!raw) return
    const parsed = JSON.parse(raw) as { disabled?: Record<string, DisabledExtensionMeta> }
    if (parsed.disabled && typeof parsed.disabled === 'object') {
      disabled = parsed.disabled
    }
  } catch {
    // Almacenamiento roto: se arranca con todo activado.
  }
}

/** True salvo desactivación explícita. */
export function isExtensionEnabled(id: string): boolean {
  return !(id in disabled)
}

/** Metas de las desactivadas (para listarlas aunque no estén registradas). */
export function getDisabledExtensions(): DisabledExtensionMeta[] {
  return Object.values(disabled)
}

export function disableExtension(meta: DisabledExtensionMeta): void {
  disabled[meta.id] = meta
  persist()
  emit()
}

export function enableExtension(id: string): void {
  if (!(id in disabled)) return
  delete disabled[id]
  persist()
  emit()
}

/** Solo tests: resetea el estado en memoria. */
export function resetEnabledForTests(): void {
  disabled = {}
  memoryFallback.clear()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Sin almacenamiento: solo memoria.
  }
}
