/**
 * FileIcons — persistencia del tema activo (localStorage).
 * Espejo de services/extensions/types/themes/store.ts.
 */

const STORAGE_KEY = 'scrakk:active-file-icon-theme'

export interface StoredActiveFileIconTheme {
  id: string
}

export function loadStoredActiveTheme(): StoredActiveFileIconTheme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredActiveFileIconTheme>
    if (typeof parsed.id !== 'string') return null
    return { id: parsed.id }
  } catch {
    return null
  }
}

export function saveStoredActiveTheme(active: StoredActiveFileIconTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(active))
  } catch {
    // Sin almacenamiento: el tema activo queda solo en memoria.
  }
}

export function clearStoredActiveTheme(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // no-op
  }
}
