// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'themes' — estado persistido.
 * Qué tema está activo y de qué extensión es (para restaurar al desinstalar).
 */

const STORAGE_KEY = 'scrakk-studio:active-theme'

export interface StoredActiveTheme {
  id: string
  extensionId: string
}

export function loadStoredActive(): StoredActiveTheme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredActiveTheme>
    if (typeof parsed.id !== 'string' || typeof parsed.extensionId !== 'string') return null
    return { id: parsed.id, extensionId: parsed.extensionId }
  } catch {
    return null
  }
}

export function saveStoredActive(active: StoredActiveTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(active))
  } catch {
    // Sin almacenamiento: el tema activo queda solo en memoria.
  }
}

export function clearStoredActive(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // no-op
  }
}
