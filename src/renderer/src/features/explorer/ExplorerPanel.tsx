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
 * (indent guiado, chevrons, filas "…") con tokens de BorealChat.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import {
  ArrowClockwiseIcon,
  CopyIcon,
  DeleteIcon,
  ExternalLinkIcon,
  FileAddIcon,
  FolderAddIcon,
  FolderIcon,
  PencilIcon,
  SearchIcon,
  SubtractSquareMultipleIcon
} from '@proicons/react'
import { IconButton, ContextMenu, type ContextMenuItem } from '@ui'
import { usePanelTitle } from '@features/layout'
import { openFileInEditor } from '@features/editor'
import { useWorkspaceState, type FileNode } from './hooks/useWorkspaceState'
import { useFileSelection } from './hooks/useFileSelection'
import { useWindowedRows } from './hooks/useWindowedRows'
import { useSelectionBox } from './hooks/useSelectionBox'
import { ExplorerRow } from './components/ExplorerRow'
import { SelectionBox } from './components/SelectionBox/SelectionBox'
import { DeleteModal, type DeleteTarget } from './components/DeleteModal'
import { ROW_HEIGHT, VIRTUAL_BUFFER } from './constants'
import { baseNameOf, isWithin, isValidName } from './utils/fileUtils'
import styles from './Explorer.module.css'

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

export function ExplorerPanel(): JSX.Element {
  const workspace = useWorkspaceState()
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

  // El header del panel muestra el nombre de la carpeta abierta.
  useEffect(() => {
    setTitle(workspace.rootPath ? baseNameOf(workspace.rootPath) : 'Explorador')
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

  const flatPaths = useMemo(
    () => flat.filter((row) => row.kind === 'node').map((row) => row.node.path),
    [flat]
  )

  // ── Virtualización: solo filas visibles (± buffer) ─────────────────────
  const windowed = useWindowedRows(flat.length, ROW_HEIGHT, VIRTUAL_BUFFER)

  // ── Caja de selección (lasso) — DOM directo, sin React state ──────────
  const selectionBoxRef = useRef<HTMLDivElement>(null)
  const selectionBox = useSelectionBox({
    containerRef: windowed.containerRef,
    boxRef: selectionBoxRef,
    rowCount: flatPaths.length,
    flatPaths,
    onCommit: (paths) => {
      selection.setSelection(paths)
    },
    onClear: () => {
      selection.clear()
    }
  })

  // ── Selección ──────────────────────────────────────────────────────────
  const handleSelect = useCallback(
    (path: string, mode?: 'single' | 'multi' | 'range'): void => {
      selection.select(path, flatPaths, mode)
      windowed.containerRef.current?.focus()
      // Single-click en un archivo → pedir su contenido y abrirlo en Innerta.
      if (!mode) {
        const row = flat.find((r) => r.kind === 'node' && r.node.path === path)
        if (row && !row.node.isDirectory) {
          openFileInEditor(row.node.path, row.node.name)
        }
      }
    },
    [selection, flatPaths, windowed.containerRef, flat]
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
  useEffect(() => {
    setActions(() => (
      <>
        <IconButton
          label="Nuevo archivo"
          size="sm"
          shape="rounded"
          onClick={() => startCreate(workspace.rootPath ?? '', false)}
        >
          <FileAddIcon size={16} />
        </IconButton>
        <IconButton
          label="Nueva carpeta"
          size="sm"
          shape="rounded"
          onClick={() => startCreate(workspace.rootPath ?? '', true)}
        >
          <FolderAddIcon size={16} />
        </IconButton>
        <IconButton
          label="Colapsar todas las carpetas"
          size="sm"
          shape="rounded"
          onClick={() => workspace.collapseAll()}
        >
          <SubtractSquareMultipleIcon size={16} />
        </IconButton>
        <IconButton label="Actualizar explorador" size="sm" shape="rounded" onClick={() => workspace.refresh()}>
          <ArrowClockwiseIcon size={16} />
        </IconButton>
      </>
    ))
    return () => setActions(null)
  }, [setActions, workspace.rootPath, startCreate, workspace.refresh, workspace.collapseAll])

  const commitCreate = useCallback(async (): Promise<void> => {
    if (!creating) return
    const name = editValue.trim()
    if (!isValidName(name)) {
      setEditError('Nombre inválido.')
      return
    }
    const res = await workspace.createEntry(creating.parentPath, name, creating.isDirectory)
    if (res.ok) {
      cancelEdit()
    } else {
      setEditError(res.error ?? 'No se pudo crear.')
    }
  }, [creating, editValue, workspace, cancelEdit])

  const commitRename = useCallback(async (): Promise<void> => {
    if (!renamingPath) return
    const name = editValue.trim()
    if (!isValidName(name)) {
      setEditError('Nombre inválido.')
      return
    }
    const res = await workspace.renameEntry(renamingPath, name)
    if (res.ok) {
      cancelEdit()
    } else {
      setEditError(res.error ?? 'No se pudo renombrar.')
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
        await workspace.deleteEntry(path)
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
      event.dataTransfer.effectAllowed = 'move'
    },
    [selection.selected]
  )

  const handleDragOver = useCallback(
    (event: React.DragEvent, node: FileNode): void => {
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
          label: 'Actualizar',
          icon: <SearchIcon size={13} />,
          onClick: () => workspace.refresh()
        },
        {
          label: 'Nuevo archivo',
          icon: <FileAddIcon size={13} />,
          onClick: () => startCreate(root, false)
        },
        {
          label: 'Nueva carpeta',
          icon: <FolderAddIcon size={13} />,
          onClick: () => startCreate(root, true)
        },
        {
          label: 'Copiar ruta raíz',
          icon: <CopyIcon size={13} />,
          separatorBefore: true,
          onClick: () => void copyPath(root)
        }
      )
      if (root) {
        items.push({
          label: 'Abrir en explorador',
          icon: <ExternalLinkIcon size={13} />,
          onClick: () => void window.api.fs.openInFolder(root)
        })
      }
      return items
    }

    if (multi) {
      items.push(
        {
          label: `Eliminar ${selection.selected.size} elementos`,
          icon: <DeleteIcon size={13} />,
          danger: true,
          onClick: () => setDeleteTarget({ label: 'elementos', paths: [...selection.selected] })
        },
        {
          label: 'Copiar rutas',
          icon: <CopyIcon size={13} />,
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
          label: 'Nuevo archivo',
          icon: <FileAddIcon size={13} />,
          onClick: () => startCreate(node.path, false)
        },
        {
          label: 'Nueva carpeta',
          icon: <FolderAddIcon size={13} />,
          onClick: () => startCreate(node.path, true)
        }
      )
    } else {
      items.push({
        label: 'Abrir',
        icon: <SearchIcon size={13} />,
        onClick: () => openFileInEditor(node.path, node.name)
      })
    }

    items.push(
      {
        label: 'Renombrar',
        icon: <PencilIcon size={13} />,
        separatorBefore: true,
        onClick: () => startRename(node)
      },
      {
        label: 'Eliminar',
        icon: <DeleteIcon size={13} />,
        danger: true,
        onClick: () => requestDelete(node)
      },
      {
        label: 'Mostrar en explorador',
        icon: <ExternalLinkIcon size={13} />,
        separatorBefore: true,
        onClick: () => void window.api.fs.openInFolder(node.path)
      },
      {
        label: 'Copiar ruta',
        icon: <CopyIcon size={13} />,
        onClick: () => void copyPath(node.path)
      }
    )
    return items
  }, [menu, workspace, selection.selected, startCreate, startRename, requestDelete, copyPath])

  // ── Atajos de teclado del árbol ────────────────────────────────────────
  const handleTreeKeyDown = useCallback(
    (event: React.KeyboardEvent): void => {
      if (event.key === 'F2') {
        const first = [...selection.selected][0]
        if (first) {
          const node = flat.find((row) => row.kind === 'node' && row.node.path === first)?.node
          if (node) startRename(node)
        }
      } else if (event.key === 'Delete') {
        const paths = [...selection.selected]
        if (paths.length > 0) {
          const firstNode = flat.find((row) => row.kind === 'node' && row.node.path === paths[0])?.node
          if (firstNode) requestDelete(firstNode)
        }
      }
    },
    [selection.selected, flat, startRename, requestDelete]
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
              <FolderIcon size={16} />
            ) : (
              <FileAddIcon size={16} />
            )}
          </span>
          <input
            className={styles.input}
            placeholder={creating?.isDirectory ? 'Nombre de carpeta…' : 'Nombre de archivo…'}
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
          <span className={styles.name}>Cargando…</span>
        </div>
      )
    }

    const isEditing = renamingPath === node.path
    return (
      <ExplorerRow
        node={node}
        level={level}
        isSelected={selection.selected.has(node.path)}
        isEditing={isEditing}
        isDragging={draggedPathsRef.current.includes(node.path)}
        isDropTarget={dropTarget === node.path}
        editValue={editValue}
        onEditValueChange={(value) => {
          setEditValue(value)
          setEditError(null)
        }}
        onSelect={handleSelect}
        onToggle={workspace.toggleFolder}
        onContextMenu={(event, n) => openMenuFor(event, n, false)}
        onOpenMenu={(event, n) => openMenuFor(event, n, false)}
        onDoubleClick={(n) => {
          if (!n.isDirectory) openFileInEditor(n.path, n.name)
        }}
        onCommitEdit={() => {
          if (isEditing) void commitRename()
        }}
        onCancelEdit={cancelEdit}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
      />
    )
  }

  const visibleRows = flat.slice(windowed.start, windowed.end)

  // Sin workspace: estado vacío con acción de abrir carpeta.
  if (!workspace.rootPath) {
    return (
      <div className={styles.explorer}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <FolderIcon size={40} />
          </div>
          <h3 className={styles.emptyTitle}>Sin workspace</h3>
          <p className={styles.emptyText}>
            Abrí una carpeta para explorar tus archivos y trabajar con el agente.
          </p>
          <div className={styles.emptyActions}>
            <button
              type="button"
              className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`}
              onClick={() => void workspace.openFolder()}
            >
              <FolderIcon size={14} />
              Abrir carpeta
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
          // Solo el fondo del árbol (no filas): mover al root.
          if (event.target !== event.currentTarget) return
          event.preventDefault()
          setDropTarget(workspace.rootPath ?? null)
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(event) => {
          if (event.target !== event.currentTarget) return
          event.preventDefault()
          if (workspace.rootPath) void moveDropped(workspace.rootPath)
        }}
        role="tree"
        aria-label="Explorador de archivos"
      >
        {workspace.isLoadingRoot && flat.length === 0 ? (
          <div className={styles.loadingRoot}>
            <span className={styles.spinner} />
            Cargando…
          </div>
        ) : null}

        <SelectionBox ref={selectionBoxRef} />

        {flat.length > 0 ? (
          <div className={styles.window} style={{ height: windowed.totalHeight }}>
            {visibleRows.map((row, index) => (
              <div
                key={row.node.path}
                className={styles.rowSlot}
                style={{ transform: `translateY(${(windowed.start + index) * ROW_HEIGHT}px)` }}
              >
                {renderRow(row)}
              </div>
            ))}
          </div>
        ) : null}

        {!workspace.isLoadingRoot && flat.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>Carpeta vacía</p>
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

      <DeleteModal
        target={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
