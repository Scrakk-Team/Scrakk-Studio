// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Explorer — panel de archivos del workspace.
 *
 * Técnicas de rendimiento portadas del Explorer GTK:
 *  - Virtualización: solo se renderizan las filas visibles del árbol
 *    (altura de fila fija + ventana con buffer).
 *  - Árbol lazy + carga incremental por lotes + cancelación por generación
 *    + watcher de filesystem (ver hooks/useWorkspaceState).
 *  - Metadata mínima en readdir (sin stat por entrada).
 *
 * Combinación de estilos: estructura del Explorer de Scrakk Code Editor
 * (indent guiado, chevrons, filas "…") con tokens de Scrakk Studio.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { ContextMenu, type ContextMenuItem } from '@ui'
import { HeaderActionButton, usePanelTitle } from '@features/layout'
import {
  isGitDecorationsVisible,
  setGitDecorationsVisible,
  subscribeToDecorations
} from './decorations'
import { openFileInEditor } from '@features/editor'
import { setResourceDragData } from '@features/dnd'
import { useWorkspaceState, type FileNode } from './hooks/useWorkspaceState'
import type { RowAction } from './components/ExplorerRow'
import { useFileSelection } from './hooks/useFileSelection'
import { useWindowedRows } from './hooks/useWindowedRows'
import { useSelectionBox, type LassoContext } from './hooks/useSelectionBox'
import { ExplorerRow } from './components/ExplorerRow'
import { focusGuideLevel, rowActiveGuideLevel } from './utils/indentGuides'
import { SelectionBox } from './components/SelectionBox/SelectionBox'
import { DeleteModal, type DeleteTarget } from './components/DeleteModal'
import { ROW_HEIGHT, VIRTUAL_BUFFER } from './constants'
import { baseNameOf, isWithin, isValidName } from './utils/fileUtils'
import { ancestorDirs, filterRowsByPaths } from './filter'
import styles from './Explorer.module.css'
import { ToolDock, ToolDockHostProvider } from '@features/tooldock'

import { t } from '@core/i18n'
import { shareFileToSocial } from '@features/social/actions/shareFile'
import { fileHandlerRegistry } from '@features/fileHandlers/registry'
import {
  canToggleMode,
  effectiveMode,
  setPreferredMode
} from '@features/fileHandlers/preferences'
import { api } from '@services/api'
/** Fila fantasma mientras se crea un archivo/carpeta. */
interface CreatingState {
  parentPath: string
  isDirectory: boolean
}

interface ContextMenuState {
  x: number
  y: number
  node: FileNode | null
  /** true si el menú se abrió sobre el fondo del árbol (sin item). */
  background: boolean
}

type FlatKind = 'node' | 'creating' | 'loading'

interface FlatRow {
  node: FileNode
  level: number
  kind: FlatKind
}

const CREATING_NODE: FileNode = {
  name: '',
  path: '__creating__',
  isDirectory: false,
  children: null,
  isExpanded: false,
  level: 0
}

const LOADING_NODE: FileNode = {
  name: 'Cargando…',
  path: '__loading__',
  isDirectory: false,
  children: null,
  isExpanded: false,
  level: 0
}

export function ExplorerPanel({
  rootOverride,
  interactive = true,
  visiblePaths = null,
  onSelectionChange,
  onOpenFile,
  rowActions,
  onLasso
}: {
  /** Raíz arbitraria a mostrar (default: workspace global). */
  rootOverride?: string
  /** false = solo lectura (sin menús, dnd ni crear/renombrar/eliminar). */
  interactive?: boolean
  /** Subset a mostrar (default: todo). Los ancestros se auto-expanden. */
  visiblePaths?: Set<string> | null
  /** Selección actual (para acciones bulk externas). */
  onSelectionChange?: (paths: string[]) => void
  /** Hook extra al abrir un archivo (default: nada). */
  onOpenFile?: (path: string, name: string) => void
  /** Acciones por fila (hover), dibujadas por el propio árbol. Ver `RowAction`. */
  rowActions?: (node: FileNode) => RowAction[]
  /**
   * Acción del RECUADRO de selección (lasso) al soltar.
   *
   * Si no se pasa, el recuadro deja los paths como selección (lo de siempre),
   * y con **Ctrl/Cmd** los SUMA a la selección existente.
   *
   * Si se pasa, el consumidor decide qué hacer: recibe los paths barridos y un
   * `ctx` con `select` (la acción por defecto, para COMPONER en vez de
   * reemplazar) y `additive` (el usuario mantuvo Ctrl/Cmd), así puede respetar
   * la suma o ignorarla:
   *
   *   onLasso: (paths, { select, additive }) => {
   *     select(additive ? [...yaSeleccionados, ...paths] : paths)
   *     stage(paths)
   *   }
   *
   * El panel de Git lo usa para preparar en lote arrastrando el recuadro.
   */
  onLasso?: (paths: string[], ctx: LassoContext) => void
}): JSX.Element {
  const workspace = useWorkspaceState(rootOverride)
  const selection = useFileSelection()
  const { setTitle, setActions } = usePanelTitle()

  // ── Edición inline (crear / renombrar) ─────────────────────────────────
  const [creating, setCreating] = useState<CreatingState | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  // ── Menú contextual / modals / drag & drop ─────────────────────────────
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const draggedPathsRef = useRef<string[]>([])
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  // Fila bajo el cursor: las guías ACTIVAS la siguen en vivo (hover) y caen
  // a la selección al salir del árbol.
  const [hoverPath, setHoverPath] = useState<string | null>(null)
  const handleRowHover = useCallback((path: string | null): void => {
    setHoverPath(path)
  }, [])

  // El header del panel muestra el nombre de la carpeta abierta.
  useEffect(() => {
    setTitle(workspace.rootPath ? baseNameOf(workspace.rootPath) : t('explorer.explorador'))
  }, [workspace.rootPath, setTitle])

  // ── Lista plana visible (para render y selección por rango) ────────────
  const flat = useMemo<FlatRow[]>(() => {
    if (!workspace.rootPath) return []
    const out: FlatRow[] = []
    const walk = (nodes: FileNode[], level: number): void => {
      for (const node of nodes) {
        out.push({ node, level, kind: 'node' })
        if (node.isDirectory && node.isExpanded) {
          if (creating && creating.parentPath === node.path) {
            out.push({ node: CREATING_NODE, level: level + 1, kind: 'creating' })
          }
          if (node.children === null) {
            out.push({
              node: { ...LOADING_NODE, path: `__loading__:${node.path}` },
              level: level + 1,
              kind: 'loading'
            })
          } else {
            walk(node.children, level + 1)
          }
        }
      }
    }
    if (creating && creating.parentPath === workspace.rootPath) {
      out.push({ node: CREATING_NODE, level: 0, kind: 'creating' })
    }
    walk(workspace.tree, 0)
    return out
  }, [workspace.tree, workspace.rootPath, creating])


  // Vista filtrada (Cambios de git): subset + ancestros auto-expandidos.
  const ancestors = useMemo(
    () =>
      visiblePaths && workspace.rootPath
        ? ancestorDirs(workspace.rootPath, visiblePaths)
        : new Set<string>(),
    [visiblePaths, workspace.rootPath]
  )

  useEffect(() => {
    if (!visiblePaths) return
    // UNA vez para todas las carpetas: llamar `ensureExpanded` en bucle costaba
    // un render por carpeta (y cada render re-aplana el árbol completo).
    // Además se depende del callback (estable) y no del objeto `workspace`, que
    // cambia de identidad en cada render y hacía que el efecto corriera siempre.
    workspace.ensureExpandedMany(ancestors)
  }, [visiblePaths, ancestors, workspace.ensureExpandedMany])
  // Selección hacia afuera (acciones bulk externas).
  useEffect(() => {
    onSelectionChange?.([...selection.selected])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.selected])

  const visibleFlat = useMemo(
    () => (visiblePaths ? filterRowsByPaths(flat, visiblePaths, ancestors) : flat),
    [flat, visiblePaths, ancestors]
  )

  const flatPaths = useMemo(
    () => visibleFlat.filter((row) => row.kind === 'node').map((row) => row.node.path),
    [visibleFlat]
  )

  // ── Virtualización: solo filas visibles (± buffer) ─────────────────────
  const windowed = useWindowedRows(visibleFlat.length, ROW_HEIGHT, VIRTUAL_BUFFER)

  // ── Caja de selección (lasso) — DOM directo, sin React state ──────────
  const selectionBoxRef = useRef<HTMLDivElement>(null)
  const selectionBox = useSelectionBox({
    containerRef: windowed.containerRef,
    boxRef: selectionBoxRef,
    rowCount: flatPaths.length,
    flatPaths,
    onCommit: (paths, additive) => {
      // La acción del recuadro es **del consumidor**: por defecto deja los
      // paths seleccionados, pero `onLasso` puede reemplazarla o componerla
      // (el panel de Git la usa para stagear en lote al arrastrar).
      const select = (next: string[]): void => selection.setSelection(next)
      if (onLasso) {
        onLasso(paths, { select, additive })
        return
      }
      // Ctrl/Cmd: se SUMA a lo que ya estaba seleccionado en vez de pisarlo.
      if (additive) select([...new Set([...selection.selected, ...paths])])
      else select(paths)
    },
    onClear: () => {
      selection.clear()
    }
  })

  // ── Selección ──────────────────────────────────────────────────────────
  // Apertura centralizada (single-click y doble-click pasan por aquí para
  // avisar a onOpenFile: dropdowns que se cierran al abrir, etc.).
  const openFile = useCallback(
    (path: string, name: string): void => {
      openFileInEditor(path, name)
      onOpenFile?.(path, name)
    },
    [onOpenFile]
  )

  const handleSelect = useCallback(
    (path: string, mode?: 'single' | 'multi' | 'range'): void => {
      selection.select(path, flatPaths, mode)
      windowed.containerRef.current?.focus()
      // Single-click en un archivo → pedir su contenido y abrirlo en Innerta.
      if (!mode) {
        const row = visibleFlat.find((r) => r.kind === 'node' && r.node.path === path)
        if (row && !row.node.isDirectory) {
          openFile(row.node.path, row.node.name)
        }
      }
    },
    [selection, flatPaths, windowed.containerRef, visibleFlat, openFile]
  )

  // ── Crear / renombrar ──────────────────────────────────────────────────
  const startCreate = useCallback((parentPath: string, isDirectory: boolean): void => {
    setCreating({ parentPath, isDirectory })
    setEditValue('')
    setEditError(null)
    setRenamingPath(null)
  }, [])

  const startRename = useCallback((node: FileNode): void => {
    setRenamingPath(node.path)
    setEditValue(node.name)
    setEditError(null)
    setCreating(null)
  }, [])

  const cancelEdit = useCallback((): void => {
    setCreating(null)
    setRenamingPath(null)
    setEditError(null)
  }, [])

  // Los botones de acción viven en el header del panel, no en una barra
  // aparte (el título ya muestra el nombre de la carpeta). Íconos y orden
  // replicados del header del Explorer de Scrakk Code Editor.
  // En modo solo lectura no hay acciones de mutación.
  // El botón git alterna los badges de estado (A/M/??/D/R) en las filas.
  //
  // Van con HeaderActionButton (no IconButton) para que el usuario pueda
  // ARRASTRARLOS y cambiar su orden: el `id` namespaced es lo que el store
  // del layout persiste, y el orden del JSX es el default.
  const [gitBadges, setGitBadges] = useState(() => isGitDecorationsVisible())
  useEffect(() => subscribeToDecorations(() => setGitBadges(isGitDecorationsVisible())), [])
  useEffect(() => {
    if (!interactive) {
      setActions(null)
      return
    }
    setActions(() => (
      <>
        <HeaderActionButton
          id="explorer.new-file"
          label={t('explorer.nuevo.archivo')}
          icon="new-file"
          size="sm"
          shape="rounded"
          onClick={() => startCreate(workspace.rootPath ?? '', false)}
        />
        <HeaderActionButton
          id="explorer.new-folder"
          label={t('explorer.nueva.carpeta')}
          icon="new-folder"
          size="sm"
          shape="rounded"
          onClick={() => startCreate(workspace.rootPath ?? '', true)}
        />
        <HeaderActionButton
          id="explorer.git-badges"
          label={gitBadges ? t('explorer.git.ocultar.estados') : t('explorer.git.mostrar.estados')}
          icon="source-control"
          size="sm"
          shape="rounded"
          variant={gitBadges ? 'accent' : 'neutral'}
          onClick={() => setGitDecorationsVisible(!gitBadges)}
        />
        <HeaderActionButton
          id="explorer.collapse-all"
          label={t('explorer.colapsar.todas.las.carpetas')}
          icon="collapse-all"
          size="sm"
          shape="rounded"
          onClick={() => workspace.collapseAll()}
        />
        <HeaderActionButton
          id="explorer.refresh"
          label={t('explorer.actualizar.explorador')}
          icon="refresh"
          size="sm"
          shape="rounded"
          onClick={() => workspace.refresh()}
        />
      </>
    ))
    return () => setActions(null)
  }, [setActions, interactive, gitBadges, workspace.rootPath, startCreate, workspace.refresh, workspace.collapseAll])

  const commitCreate = useCallback(async (): Promise<void> => {
    if (!creating) return
    const name = editValue.trim()
    if (!isValidName(name)) {
      setEditError(t('explorer.nombre.invalido'))
      return
    }
    const res = await workspace.createEntry(creating.parentPath, name, creating.isDirectory)
    if (res.ok) {
      cancelEdit()
    } else {
      setEditError(res.error ?? t('explorer.no.se.pudo.crear'))
    }
  }, [creating, editValue, workspace, cancelEdit])

  const commitRename = useCallback(async (): Promise<void> => {
    if (!renamingPath) return
    const name = editValue.trim()
    if (!isValidName(name)) {
      setEditError(t('explorer.nombre.invalido'))
      return
    }
    const res = await workspace.renameEntry(renamingPath, name)
    if (res.ok) {
      cancelEdit()
    } else {
      setEditError(res.error ?? t('explorer.no.se.pudo.renombrar'))
    }
  }, [renamingPath, editValue, workspace, cancelEdit])

  // ── Borrar ─────────────────────────────────────────────────────────────
  const requestDelete = useCallback(
    (node: FileNode): void => {
      const multi = selection.selected.size > 1 && selection.selected.has(node.path)
      if (multi) {
        setDeleteTarget({ label: `${selection.selected.size} elementos`, paths: [...selection.selected] })
      } else {
        setDeleteTarget({ label: node.name, paths: [node.path] })
      }
    },
    [selection.selected]
  )

  const confirmDelete = useCallback(
    async (paths: string[]): Promise<void> => {
      for (const path of paths) {
        const res = await workspace.deleteEntry(path)
        if (!res.ok) {
          // Se propaga para que el modal muestre el error y no cierre en falso.
          throw new Error(res.error ?? `No se pudo eliminar "${path}".`)
        }
      }
      selection.setSelection([])
    },
    [workspace, selection]
  )

  // ── Drag & drop ────────────────────────────────────────────────────────
  const handleDragStart = useCallback(
    (event: React.DragEvent, node: FileNode): void => {
      const paths = selection.selected.has(node.path)
        ? [...selection.selected]
        : [node.path]
      draggedPathsRef.current = paths
      event.dataTransfer.setData('text/plain', node.path)
      // Publica el recurso para el sistema de tabs: soltarlo en una zona de
      // tabs lo abre como tab (archivo) o crea un explorador (carpeta).
      setResourceDragData(event.dataTransfer, [
        { kind: node.isDirectory ? 'folder' : 'file', path: node.path, name: node.name }
      ])
      event.dataTransfer.effectAllowed = 'copyMove'
    },
    [selection.selected]
  )

  const handleDragOver = useCallback(
    (event: React.DragEvent, node: FileNode): void => {
      // Drag INTERNO del explorador: lo maneja el explorador aunque el destino
      // no sea carpeta. Frena el handler del slot, que crearía una tab.
      if (draggedPathsRef.current.length > 0) event.stopPropagation()
      if (!node.isDirectory) return
      const invalid = draggedPathsRef.current.some((p) => isWithin(node.path, p))
      if (invalid) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      setDropTarget(node.path)
    },
    []
  )

  const moveDropped = useCallback(
    async (targetDir: string): Promise<void> => {
      const paths = draggedPathsRef.current
      draggedPathsRef.current = []
      setDropTarget(null)
      if (paths.length === 0 || !targetDir) return
      if (paths.some((p) => isWithin(targetDir, p))) return
      for (const path of paths) {
        await workspace.moveInto([path], targetDir)
      }
    },
    [workspace]
  )

  const handleDrop = useCallback(
    (event: React.DragEvent, node: FileNode): void => {
      if (draggedPathsRef.current.length > 0) event.stopPropagation()
      event.preventDefault()
      if (!node.isDirectory) return
      void moveDropped(node.path)
    },
    [moveDropped]
  )

  const handleDragEnd = useCallback((): void => {
    draggedPathsRef.current = []
    setDropTarget(null)
  }, [])

  // ── Menú contextual ────────────────────────────────────────────────────
  const openMenuFor = useCallback(
    (event: React.MouseEvent, node: FileNode | null, background: boolean): void => {
      event.preventDefault()
      setMenu({ x: event.clientX, y: event.clientY, node, background })
    },
    []
  )

  const copyPath = useCallback(async (path: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(path)
    } catch {
      // Sin permiso de clipboard: se ignora.
    }
  }, [])

  const menuItems = useMemo<ContextMenuItem[]>(() => {
    if (!menu) return []
    const items: ContextMenuItem[] = []
    const root = workspace.rootPath ?? ''
    const multi =
      menu.node !== null &&
      !menu.background &&
      selection.selected.size > 1 &&
      selection.selected.has(menu.node.path)

    if (menu.background || menu.node === null) {
      items.push(
        {
          label: t('explorer.actualizar'),
          onClick: () => workspace.refresh()
        },
        {
          label: t('explorer.nuevo.archivo'),
          onClick: () => startCreate(root, false)
        },
        {
          label: t('explorer.nueva.carpeta'),
          onClick: () => startCreate(root, true)
        },
        {
          label: t('explorer.copiar.ruta.raiz'),
          separatorBefore: true,
          onClick: () => void copyPath(root)
        }
      )
      if (root) {
        items.push({
          label: t('explorer.abrir.en.explorador'),
          onClick: () => void api.fs.openInFolder(root)
        })
      }
      return items
    }

    if (multi) {
      items.push(
        {
          label: `Eliminar ${selection.selected.size} elementos`,
          danger: true,
          onClick: () => setDeleteTarget({ label: 'elementos', paths: [...selection.selected] })
        },
        {
          label: t('explorer.copiar.rutas'),
          separatorBefore: true,
          onClick: () => void copyPath([...selection.selected].join('\n'))
        }
      )
      return items
    }

    const node = menu.node
    if (node.isDirectory) {
      items.push(
        {
          label: t('explorer.nuevo.archivo'),
          onClick: () => startCreate(node.path, false)
        },
        {
          label: t('explorer.nueva.carpeta'),
          onClick: () => startCreate(node.path, true)
        }
      )
    } else {
      items.push({
        label: t('explorer.abrir'),
        onClick: () => openFileInEditor(node.path, node.name)
      })
      items.push({
        label: t('social.compartir.en.social'),
        onClick: () => void shareFileToSocial(node.path)
      })
      // El mismo toggle visor ⇄ editor que el menú de la tab.
      const nodeHandler = fileHandlerRegistry.resolve(node.path)
      const nodeCanToggle = canToggleMode(nodeHandler, node.path)
      const nodeViewing = effectiveMode(nodeHandler, node.path) === 'view'
      items.push({
        label: !nodeHandler?.load
          ? t('features.sin.visor.para.este.formato')
          : nodeViewing
            ? t('features.ver.como.texto')
            : t('features.ver.como.visor'),
        icon: <ProductIcon id={nodeViewing ? 'eye-off' : 'eye'} size={14} aria-hidden="true" />,
        disabled: !nodeCanToggle,
        onClick: nodeCanToggle
          ? () => setPreferredMode(node.path, nodeViewing ? 'text' : 'view')
          : undefined
      })
    }

    items.push(
      {
        label: t('explorer.renombrar'),
        separatorBefore: true,
        onClick: () => startRename(node)
      },
      {
        label: t('explorer.eliminar'),
        danger: true,
        onClick: () => requestDelete(node)
      },
      {
        label: t('explorer.mostrar.en.explorador'),
        separatorBefore: true,
        onClick: () => void api.fs.openInFolder(node.path)
      },
      {
        label: t('explorer.copiar.ruta'),
        onClick: () => void copyPath(node.path)
      }
    )
    return items
  }, [menu, workspace, selection.selected, startCreate, startRename, requestDelete, copyPath])

  // ── Atajos de teclado del árbol ────────────────────────────────────────
  const handleTreeKeyDown = useCallback(
    (event: React.KeyboardEvent): void => {
      // Solo lectura: sin atajos de mutación.
      if (!interactive) return
      if (event.key === 'F2') {
        const first = [...selection.selected][0]
        if (first) {
          const node = visibleFlat.find((row) => row.kind === 'node' && row.node.path === first)?.node
          if (node) startRename(node)
        }
      } else if (event.key === 'Delete') {
        const paths = [...selection.selected]
        if (paths.length > 0) {
          const firstNode = visibleFlat.find((row) => row.kind === 'node' && row.node.path === paths[0])?.node
          if (firstNode) requestDelete(firstNode)
        }
      }
    },
    [selection.selected, visibleFlat, startRename, requestDelete, interactive]
  )

  // ── Render ─────────────────────────────────────────────────────────────
  const renderRow = (row: FlatRow): JSX.Element => {
    const { node, level, kind } = row

    if (kind === 'creating') {
      return (
        <div
          className={styles.row}
          style={{ height: ROW_HEIGHT, paddingLeft: 8 + level * 12 }}
        >
          <span className={styles.arrowPlaceholder} style={{ width: 16, height: 16 }} />
          <span className={[styles.icon, creating?.isDirectory ? styles.iconFolder : styles.iconFile].join(' ')}>
            {creating?.isDirectory ? (
              <ProductIcon id="folder" size={16} />
            ) : (
              <ProductIcon id="new-file" size={16} />
            )}
          </span>
          <input
            className={styles.input}
            placeholder={creating?.isDirectory ? t('explorer.nombre.de.carpeta') : t('explorer.nombre.de.archivo')}
            value={editValue}
            onChange={(event) => {
              setEditValue(event.target.value)
              setEditError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void commitCreate()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                cancelEdit()
              }
            }}
            onBlur={() => {
              if (!editValue.trim()) cancelEdit()
              else void commitCreate()
            }}
            autoFocus
          />
          {editError ? <span className={styles.editError}>{editError}</span> : null}
        </div>
      )
    }

    if (kind === 'loading') {
      return (
        <div
          className={`${styles.row} ${styles.special}`}
          style={{ height: ROW_HEIGHT, paddingLeft: 8 + level * 12 }}
        >
          <span className={styles.arrowPlaceholder} style={{ width: 16, height: 16 }} />
          <span className={styles.name}>{t('explorer.cargando')}</span>
        </div>
      )
    }

    const isEditing = renamingPath === node.path
    return (
      <ExplorerRow
        node={node}
        level={level}
        isSelected={selection.selected.has(node.path)}
        activeGuideLevel={rowActiveGuideLevel(node.path, guideFocus)}
        onHover={handleRowHover}
        isEditing={isEditing}
        isDragging={draggedPathsRef.current.includes(node.path)}
        isDropTarget={dropTarget === node.path}
        editValue={editValue}
        interactive={interactive}
        hideDots={!interactive}
        rowActions={rowActions}
        onEditValueChange={(value) => {
          setEditValue(value)
          setEditError(null)
        }}
        onSelect={handleSelect}
        onToggle={workspace.toggleFolder}
        onContextMenu={interactive ? (event, n) => openMenuFor(event, n, false) : noopRowEvent}
        onOpenMenu={interactive ? (event, n) => openMenuFor(event, n, false) : noopRowEvent}
        onDoubleClick={(n) => {
          if (!n.isDirectory) openFile(n.path, n.name)
        }}
        onCommitEdit={() => {
          if (isEditing) void commitRename()
        }}
        onCancelEdit={cancelEdit}
        onDragStart={interactive ? handleDragStart : noopDragEvent}
        onDragOver={interactive ? handleDragOver : noopDragEvent}
        onDrop={interactive ? handleDrop : noopDragEvent}
        onDragEnd={handleDragEnd}
      />
    )
  }

  const visibleRows = visibleFlat.slice(windowed.start, windowed.end)

  // Foco para la guía ACTIVA (hover en vivo, selección al salir): UNA sola
  // línea — la de la carpeta en foco — en su subárbol. Memoizado, no por fila.
  const guideFocus = useMemo(() => {
    const path = hoverPath ?? selection.lastSelected
    const level = focusGuideLevel(workspace.rootPath, path)
    return path !== null && level !== null ? { path, level } : null
  }, [workspace.rootPath, hoverPath, selection.lastSelected])

  // No-ops tipados para modo solo lectura (las filas exigen handlers).
  const noopRowEvent = (_event: React.MouseEvent, _node: FileNode): void => {}
  const noopDragEvent = (_event: React.DragEvent, _node: FileNode): void => {}

  // Sin workspace: estado vacío con acción de abrir carpeta.
  if (!workspace.rootPath) {
    return (
      <div className={styles.explorer}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <ProductIcon id="folder" size={40} />
          </div>
          <h3 className={styles.emptyTitle}>{t('explorer.sin.workspace')}</h3>
          <p className={styles.emptyText}>
            {t('explorer.abre.una.carpeta.para.explorar')}
          </p>
          <div className={styles.emptyActions}>
            <button
              type="button"
              className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`}
              onClick={() => void workspace.openFolder()}
            >
              <ProductIcon id="folder" size={14} />
              {t('explorer.abrir.carpeta')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.explorer}>
      <div
        ref={windowed.attachContainer}
        className={styles.tree}
        tabIndex={0}
        onKeyDown={handleTreeKeyDown}
        onMouseLeave={() => setHoverPath(null)}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            selection.clear()
            windowed.containerRef.current?.focus()
          }
          selectionBox.handleMouseDown(event)
        }}
        onContextMenu={(event) => {
          // Solo el fondo del árbol (no filas): las filas manejan las suyas.
          if (event.target !== event.currentTarget) return
          event.preventDefault()
          openMenuFor(event, null, true)
        }}
        onDragOver={(event) => {
          if (!interactive) return
          // Drag INTERNO: lo maneja el explorador y nunca debe llegar al slot
          // (que crearía una tab). El fondo del árbol mueve al root.
          if (draggedPathsRef.current.length > 0) {
            event.stopPropagation()
            if (event.target === event.currentTarget) {
              event.preventDefault()
              setDropTarget(workspace.rootPath ?? null)
            }
            return
          }
          if (event.target !== event.currentTarget) return
          event.preventDefault()
          setDropTarget(workspace.rootPath ?? null)
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(event) => {
          if (!interactive) return
          if (draggedPathsRef.current.length > 0) event.stopPropagation()
          if (event.target !== event.currentTarget) return
          event.preventDefault()
          if (workspace.rootPath) void moveDropped(workspace.rootPath)
        }}
        role="tree"
        aria-label={t('explorer.explorador.de.archivos')}
      >
        {workspace.isLoadingRoot && visibleFlat.length === 0 ? (
          <div className={styles.loadingRoot}>
            <span className={styles.spinner} />
            {t('explorer.cargando')}
          </div>
        ) : null}

        <SelectionBox ref={selectionBoxRef} />

        {visibleFlat.length > 0 ? (
          <div className={styles.window} style={{ height: windowed.totalHeight }}>
            {visibleRows.map((row, index) => {
              // Merge visual de seleccionadas contiguas (sin :has: cada fila
              // vive en su wrapper y el scope de CSS Modules no lo resuelve).
              const isSel = (r: (typeof visibleRows)[number]): boolean =>
                r.kind === 'node' && selection.selected.has(r.node.path)
              const mergeTop = isSel(row) && index > 0 && isSel(visibleRows[index - 1])
              const mergeBottom =
                isSel(row) && index < visibleRows.length - 1 && isSel(visibleRows[index + 1])
              return (
                <div
                  key={row.node.path}
                  className={[
                    styles.rowSlot,
                    mergeTop ? styles.rowSlotMergeTop : null,
                    mergeBottom ? styles.rowSlotMergeBottom : null
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ transform: `translateY(${(windowed.start + index) * ROW_HEIGHT}px)` }}
                >
                  {renderRow(row)}
                </div>
              )
            })}
          </div>
        ) : null}

        {!workspace.isLoadingRoot && visibleFlat.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>{t('explorer.carpeta.vacia')}</p>
          </div>
        ) : null}
      </div>

      {menu ? (
        <ContextMenu
          items={menuItems}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteModal
          target={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      ) : null}

      <ToolDockHostProvider hostId="explorer">
        <ToolDock />
      </ToolDockHostProvider>
    </div>
  )
}
