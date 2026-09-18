/**
 * ProductIcons — persistencia del tema activo (localStorage).
 * Espejo de services/fileIcons/store.ts.
 */

const STORAGE_KEY = 'scrakk:active-product-icon-theme'

export interface StoredActiveProductIconTheme {
  id: string
}

export function loadStoredActiveProductTheme(): StoredActiveProductIconTheme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredActiveProductIconTheme>
    if (typeof parsed.id !== 'string') return null
    return { id: parsed.id }
  } catch {
    return null
  }
}

export function saveStoredActiveProductTheme(active: StoredActiveProductIconTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(active))
  } catch {
    // Sin almacenamiento: el tema activo queda solo en memoria.
  }
}

export function clearStoredActiveProductTheme(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // no-op
  }
}
