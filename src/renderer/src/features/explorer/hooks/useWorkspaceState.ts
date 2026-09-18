/**
 * Estado del workspace del Explorer.
 *
 * Técnicas portadas del Explorer GTK:
 *  - Árbol lazy: los hijos se cargan recién al expandir (cache + dedupe).
 *  - Metadata mínima: readdir devuelve solo nombre + tipo (sin stat).
 *  - Carga incremental por lotes: los directorios grandes se insertan en
 *    chunks (rAF) para que la UI pinte progresivamente.
 *  - Cancelación: un contador de generación descarta lecturas obsoletas
 *    cuando cambia la raíz o se refresca.
 *  - Watcher de filesystem: cada carpeta cargada y expandida se vigila y se
 *    refresca sola cuando cambia (crear/borrar/renombrar por fuera).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReaddirEntry } from '@shared/fs'
import { BATCH_SIZE } from '../constants'
import { joinPath, parentPathOf } from '../utils/fileUtils'

export interface FileNode {
  name: string
  /** Ruta absoluta. */
  path: string
  isDirectory: boolean
  /** null = no cargado aún; [] = carpeta vacía; [...] = cargado. */
  children: FileNode[] | null
  isExpanded: boolean
  level: number
}

const STORAGE_KEY = 'scrakk-studio:root-path'

/**
 * Setea la raíz del workspace desde cualquier parte de la app: persiste la
 * ruta y avisa a los Explorer montados vía el evento 'workspace-changed'.
 */
export function setWorkspaceRoot(path: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, path)
  } catch {
    // Sin almacenamiento: la raíz queda en memoria.
  }
  window.dispatchEvent(new CustomEvent('workspace-changed', { detail: { path } }))
}

/**
 * Raíz del workspace abierta (o null). Lectura pura, sin hook: la usan
 * consumidores que necesitan la ruta fuera de React (ej. el jail del fs que
 * se le declara al Extension Host).
 */
export function getWorkspaceRoot(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function sortEntries(entries: FileNode[]): FileNode[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })
}

function toNode(entry: ReaddirEntry, parentPath: string, level: number): FileNode {
  return {
    name: entry.name,
    path: joinPath(parentPath, entry.name),
    isDirectory: entry.is_directory,
    children: null,
    isExpanded: false,
    level
  }
}

export interface WorkspaceApi {
  rootPath: string | null
  setRootPath: (path: string) => void
  /** Árbol visible (solo ramas expandidas). */
  tree: FileNode[]
  isLoadingRoot: boolean
  /** Alterna expansión de una carpeta (carga lazy la primera vez). */
  toggleFolder: (dirPath: string) => void
  /** Asegura una carpeta expandida+cargada (vistas filtradas). Nunca colapsa. */
  ensureExpanded: (dirPath: string) => void
  /** Recarga la raíz completa. */
  refresh: () => void
  /** Recarga un directorio puntual (invalida su cache). */
  refreshNode: (dirPath: string) => void
  collapseAll: () => void
  /** Abre el diálogo nativo y setea la raíz. */
  openFolder: () => Promise<{ ok: boolean; error?: string }>
  createEntry: (parentPath: string, name: string, isDirectory: boolean) => Promise<{ ok: boolean; error?: string }>
  renameEntry: (oldPath: string, newName: string) => Promise<{ ok: boolean; error?: string }>
  deleteEntry: (path: string) => Promise<{ ok: boolean; error?: string }>
  /** Mueve una o más rutas a un directorio destino (drag & drop). */
  moveInto: (paths: string[], targetDir: string) => Promise<{ ok: boolean; error?: string }>
}

export function useWorkspaceState(rootOverride?: string): WorkspaceApi {
  const [storedRoot, setStoredRoot] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  })

  // Override para spawnear el árbol en otra raíz (GitPanel, etc.): todo lo
  // pesado (cache, watcher, lotes) ya es path-based, solo cambia la raíz
  // leída. La escritura global (setRootPath) sigue intacta.
  const rootPath = rootOverride ?? storedRoot

  // Cache + dedupe en refs (mutables, sin re-renders espurios); treeVersion
  // fuerza el re-render cuando cambia algo del árbol.
  const cacheRef = useRef(new Map<string, FileNode[]>())
  const loadedRef = useRef(new Set<string>())
  const loadingRef = useRef(new Set<string>())
  const expandedRef = useRef(new Set<string>())
  const watchedRef = useRef(new Set<string>())
  /** Descartar lecturas obsoletas (cambio de raíz / refresh). */
  const generationRef = useRef(0)
  const [treeVersion, setTreeVersion] = useState(0)
  const [isLoadingRoot, setIsLoadingRoot] = useState(false)

  const bump = useCallback(() => setTreeVersion((v) => v + 1), [])

  // ── Watcher: vigilar/desvigilar un directorio ──────────────────────────
  const ensureWatched = useCallback((dirPath: string): void => {
    if (watchedRef.current.has(dirPath)) return
    watchedRef.current.add(dirPath)
    window.api.fs.watchDir(dirPath)
  }, [])

  const unwatch = useCallback((dirPath: string): void => {
    if (!watchedRef.current.has(dirPath)) return
    watchedRef.current.delete(dirPath)
    window.api.fs.unwatchDir(dirPath)
  }, [])

  const unwatchAll = useCallback((): void => {
    for (const dirPath of watchedRef.current) {
      window.api.fs.unwatchDir(dirPath)
    }
    watchedRef.current.clear()
  }, [])

  // ── Carga incremental por lotes ────────────────────────────────────────
  const insertInBatches = useCallback(
    (dirPath: string, nodes: FileNode[]): void => {
      loadedRef.current.add(dirPath)
      if (nodes.length <= BATCH_SIZE) {
        cacheRef.current.set(dirPath, nodes)
        bump()
        return
      }
      // Directorio grande: insertar por chunks con rAF para no bloquear.
      let index = 0
      const insertChunk = (): void => {
        const next = nodes.slice(index, index + BATCH_SIZE)
        index += next.length
        const existing = cacheRef.current.get(dirPath) ?? []
        cacheRef.current.set(dirPath, sortEntries([...existing, ...next]))
        bump()
        if (index < nodes.length) {
          requestAnimationFrame(insertChunk)
        }
      }
      insertChunk()
    },
    [bump]
  )

  const loadDir = useCallback(
    async (dirPath: string, level: number): Promise<void> => {
      if (loadedRef.current.has(dirPath) || loadingRef.current.has(dirPath)) return
      const generation = generationRef.current
      loadingRef.current.add(dirPath)
      bump()
      try {
        const res = await window.api.fs.readdir(dirPath)
        if (generation !== generationRef.current) return // lectura obsoleta
        if (res.success) {
          const nodes = sortEntries(res.entries.map((entry) => toNode(entry, dirPath, level)))
          insertInBatches(dirPath, nodes)
          if (expandedRef.current.has(dirPath)) ensureWatched(dirPath)
        }
      } catch {
        // Carpeta ilegible: queda sin hijos; el renderer muestra vacío.
      } finally {
        if (generation === generationRef.current) {
          loadingRef.current.delete(dirPath)
          bump()
        }
      }
    },
    [bump, insertInBatches, ensureWatched]
  )

  const loadRoot = useCallback(
    async (path: string): Promise<void> => {
      const generation = generationRef.current
      setIsLoadingRoot(true)
      try {
        const res = await window.api.fs.readdir(path)
        if (generation !== generationRef.current) return
        if (res.success) {
          const nodes = sortEntries(res.entries.map((entry) => toNode(entry, path, 0)))
          insertInBatches(path, nodes)
          ensureWatched(path)
        }
      } catch {
        // Raíz ilegible: árbol vacío.
      } finally {
        if (generation === generationRef.current) {
          setIsLoadingRoot(false)
          bump()
        }
      }
    },
    [bump, insertInBatches, ensureWatched]
  )

  // ── Eventos del watcher: refrescar solo la carpeta que cambió ──────────
  const refreshNode = useCallback(
    (dirPath: string): void => {
      cacheRef.current.delete(dirPath)
      loadedRef.current.delete(dirPath)
      if (dirPath === rootPath) {
        void loadRoot(dirPath)
      } else if (expandedRef.current.has(dirPath)) {
        void loadDir(dirPath, 0)
      } else {
        bump()
      }
    },
    [rootPath, loadRoot, loadDir, bump]
  )

  // Suscripción única a cambios de directorios vigilados.
  useEffect(() => {
    return window.api.fs.onWatchChanged(({ path }) => refreshNode(path))
  }, [refreshNode])

  // Limpieza al desmontar: desvigilar todo.
  useEffect(() => {
    return () => {
      unwatchAll()
      generationRef.current++
    }
  }, [unwatchAll])

  // Carga inicial / cambio de raíz: cancela lecturas viejas, limpia y recarga.
  useEffect(() => {
    if (!rootPath) return
    generationRef.current++
    unwatchAll()
    cacheRef.current.clear()
    loadedRef.current.clear()
    expandedRef.current.clear()
    loadingRef.current.clear()
    void loadRoot(rootPath)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPath])

  const setRootPath = useCallback((path: string): void => {
    setWorkspaceRoot(path)
    setStoredRoot(path)
  }, [])

  // Si OTRO componente cambió el workspace, seguirlo.
  useEffect(() => {
    const onWorkspaceChanged = (event: Event): void => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path
      if (path) setStoredRoot(path)
    }
    window.addEventListener('workspace-changed', onWorkspaceChanged)
    return () => window.removeEventListener('workspace-changed', onWorkspaceChanged)
  }, [])

  const toggleFolder = useCallback(
    (dirPath: string): void => {
      const expanded = expandedRef.current
      if (expanded.has(dirPath)) {
        expanded.delete(dirPath)
        unwatch(dirPath)
      } else {
        expanded.add(dirPath)
        if (!loadedRef.current.has(dirPath)) {
          void loadDir(dirPath, 0)
        } else {
          ensureWatched(dirPath)
        }
      }
      bump()
    },
    [bump, loadDir, unwatch, ensureWatched]
  )

  /**
   * Asegura una carpeta expandida+cargada (vistas filtradas que auto-expanden
   * ancestros). No colapsa nunca; no-op si ya está expandida.
   */
  const ensureExpanded = useCallback(
    (dirPath: string): void => {
      if (!expandedRef.current.has(dirPath)) {
        expandedRef.current.add(dirPath)
        bump()
      }
      if (!loadedRef.current.has(dirPath) && !loadingRef.current.has(dirPath)) {
        void loadDir(dirPath, 0)
      } else {
        ensureWatched(dirPath)
      }
    },
    [bump, loadDir, ensureWatched]
  )

  const refresh = useCallback((): void => {
    if (!rootPath) return
    generationRef.current++
    unwatchAll()
    cacheRef.current.clear()
    loadedRef.current.clear()
    loadingRef.current.clear()
    void loadRoot(rootPath)
  }, [rootPath, loadRoot, unwatchAll])

  const collapseAll = useCallback((): void => {
    unwatchAll()
    expandedRef.current.clear()
    bump()
  }, [bump, unwatchAll])

  const openFolder = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const res = await window.api.fs.pickFolder()
    if (res.success && res.path) {
      setRootPath(res.path)
      return { ok: true }
    }
    return { ok: false, error: res.error }
  }, [setRootPath])

  const createEntry = useCallback(
    async (parentPath: string, name: string, isDirectory: boolean): Promise<{ ok: boolean; error?: string }> => {
      const full = joinPath(parentPath, name)
      // No sobrescribir: si ya existe algo con ese nombre, fallar antes.
      const existing = await window.api.fs.exists(full)
      if (existing.exists) {
        return { ok: false, error: 'Ya existe un archivo o carpeta con ese nombre.' }
      }
      const res = isDirectory
        ? await window.api.fs.mkdir(full)
        : await window.api.fs.writeFile(full, '')
      if (res.success) {
        refreshNode(parentPath)
      }
      return { ok: res.success, error: res.success ? undefined : (res as { error?: string }).error }
    },
    [refreshNode]
  )

  const renameEntry = useCallback(
    async (oldPath: string, newName: string): Promise<{ ok: boolean; error?: string }> => {
      const parent = parentPathOf(oldPath)
      const newPath = joinPath(parent, newName)
      if (newPath !== oldPath) {
        const existing = await window.api.fs.exists(newPath)
        if (existing.exists) {
          return { ok: false, error: 'Ya existe un archivo o carpeta con ese nombre.' }
        }
      }
      const res = await window.api.fs.moveFile(oldPath, newPath)
      if (res.success) {
        // Si era carpeta, su sub-cache queda huérfana bajo la ruta vieja.
        cacheRef.current.delete(oldPath)
        loadedRef.current.delete(oldPath)
        refreshNode(parent)
      }
      return { ok: res.success, error: res.error }
    },
    [refreshNode]
  )

  const deleteEntry = useCallback(
    async (path: string): Promise<{ ok: boolean; error?: string }> => {
      const parent = parentPathOf(path)
      const res = await window.api.fs.deleteFile(path)
      if (res.success) {
        cacheRef.current.delete(path)
        loadedRef.current.delete(path)
        expandedRef.current.delete(path)
        unwatch(path)
        refreshNode(parent)
      }
      return { ok: res.success, error: res.error }
    },
    [refreshNode, unwatch]
  )

  const moveInto = useCallback(
    async (paths: string[], targetDir: string): Promise<{ ok: boolean; error?: string }> => {
      let ok = true
      let error: string | undefined
      for (const path of paths) {
        const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
        const res = await window.api.fs.moveFile(path, joinPath(targetDir, name))
        if (!res.success) {
          ok = false
          error = res.error
        } else {
          cacheRef.current.delete(path)
          loadedRef.current.delete(path)
        }
      }
      refreshNode(targetDir)
      for (const path of paths) refreshNode(parentPathOf(path))
      return { ok, error }
    },
    [refreshNode]
  )

  const tree = useMemo<FileNode[]>(() => {
    if (!rootPath) return []
    const build = (dirPath: string, level: number): FileNode[] => {
      const entries = cacheRef.current.get(dirPath) ?? []
      return entries.map((entry) => {
        const isExpanded = expandedRef.current.has(entry.path)
        let children: FileNode[] | null = null
        if (entry.isDirectory && isExpanded && loadedRef.current.has(entry.path)) {
          children = build(entry.path, level + 1)
        }
        return { ...entry, children, isExpanded, level }
      })
    }
    return build(rootPath, 0)
  }, [rootPath, treeVersion])

  return {
    rootPath,
    setRootPath,
    tree,
    isLoadingRoot,
    toggleFolder,
    ensureExpanded,
    refresh,
    refreshNode,
    collapseAll,
    openFolder,
    createEntry,
    renameEntry,
    deleteEntry,
    moveInto
  }
}
