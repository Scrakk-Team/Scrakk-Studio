/**
 * Historial de workspaces (proyectos) — servicio singleton.
 *
 * La app y el widget de la titlebar usan ESTA MISMA API:
 * - `recordWorkspace(path)` registra (dedupe, nuevas primero, tope 20).
 * - `listWorkspaces()` / `getActiveWorkspace()` / `prevWorkspace()` / `nextWorkspace()`.
 * - `subscribeToWorkspaces()` para re-render.
 *
 * Persistencia en localStorage (`scrakk-studio:workspaces-history`); el
 * workspace ACTIVO se lee de la misma key que usa el Explorer
 * (`scrakk-studio:root-path`) — nada hardcodeado, el nombre del proyecto
 * deriva de la carpeta real vía `baseNameOf()`.
 *
 * Auto-registro: en renderer escucha 'workspace-changed' (el evento que ya
 * emite `setWorkspaceRoot`), así abrir carpeta desde cualquier lado
 * (menú, comandos, explorador) entra al historial sin tocar ese código.
 */

const HISTORY_KEY = 'scrakk-studio:workspaces-history'
/** Misma key que `features/explorer/hooks/useWorkspaceState`. */
const ROOT_KEY = 'scrakk-studio:root-path'
/** Tope del historial (memoria acotada: los viejos se descartan). */
const MAX_HISTORY = 20

export type WorkspacesListener = () => void

/** Nombre de carpeta real (último segmento, sin slashes finales). */
export function baseNameOf(path: string): string {
  const clean = path.trim().replace(/[/\\]+$/, '')
  if (!clean) return path
  return clean.slice(Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\')) + 1) || clean
}

function normalize(path: string): string {
  return path.trim().replace(/[/\\]+$/, '')
}

function readStorage(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, value)
  } catch {
    // Sin almacenamiento: el historial queda en memoria.
  }
}

let cached: string[] | null = null
/** Fallback en memoria (tests/node sin localStorage, o sin storage). */
let memoryFallback: string[] = []
/** Último path registrado (activo en entornos sin localStorage). */
let lastRecorded: string | null = null
const listeners = new Set<WorkspacesListener>()

function load(): string[] {
  if (cached) return cached
  const raw = readStorage(HISTORY_KEY)
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        cached = (parsed as unknown[]).filter((p): p is string => typeof p === 'string' && p.length > 0)
        return cached
      }
    } catch {
      // JSON corrupto: se arranca vacío.
    }
  }
  cached = [...memoryFallback]
  return cached
}

function persist(): void {
  const list = cached ?? []
  memoryFallback = [...list]
  writeStorage(HISTORY_KEY, JSON.stringify(list))
}

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Suscriptor roto no tumba a los demás.
    }
  }
}

/** Historial (nuevos primero). Solo lectura: devuelve copia. */
export function listWorkspaces(): string[] {
  return [...load()]
}

/** Workspace activo (raíz actual del Explorer). Null si no hay. */
export function getActiveWorkspace(): string | null {
  return readStorage(ROOT_KEY) ?? lastRecorded
}

export function subscribeToWorkspaces(listener: WorkspacesListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Registra un workspace: dedupe + al frente + tope. Emite solo si cambió.
 */
export function recordWorkspace(path: string): void {
  const clean = normalize(path)
  if (!clean) return
  lastRecorded = clean
  const list = load()
  const without = list.filter((p) => p !== clean)
  const next = [clean, ...without].slice(0, MAX_HISTORY)
  const changed = next.length !== list.length || next.some((p, i) => p !== list[i])
  cached = next
  persist()
  if (changed) emit()
}

/** Anterior en el historial respecto a `current`. Null si no hay. */
export function prevWorkspace(current: string | null): string | null {
  if (!current) return null
  const list = load()
  const index = list.indexOf(current)
  if (index === -1) return list[0] ?? null
  return list[index - 1] ?? null
}

/** Siguiente en el historial respecto a `current`. Null si no hay. */
export function nextWorkspace(current: string | null): string | null {
  if (!current) return null
  const list = load()
  const index = list.indexOf(current)
  if (index === -1) return null
  return list[index + 1] ?? null
}

/** Solo tests: resetea memoria + storage. */
export function _resetWorkspacesForTests(): void {
  cached = []
  memoryFallback = []
  lastRecorded = null
  listeners.clear()
  writeStorage(HISTORY_KEY, JSON.stringify([]))
}

// Auto-registro ante cambios de raíz (menú, comandos, explorador…).
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('workspace-changed', (event: Event) => {
    const path = (event as CustomEvent<{ path?: string }>).detail?.path
    if (typeof path === 'string' && path.length > 0) recordWorkspace(path)
  })
}
