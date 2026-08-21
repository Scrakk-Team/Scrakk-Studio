/**
 * Fila del árbol — memoizada. Un solo elemento por archivo/carpeta:
 * guías de indentación, chevron (carpetas), ícono por tipo, nombre con
 * tooltip de ruta completa, input inline al editar y botón "…".
 * Altura fija (22px) para que la virtualización sea exacta.
 */

import { memo, useEffect, useRef, type JSX } from 'react'
import { ChevronDownIcon, ChevronRightIcon, MoreHorizontalIcon } from '@proicons/react'
import type { FileNode } from '../hooks/useWorkspaceState'
import { ROW_FONT_SIZE, ROW_HEIGHT, ROW_ICON_SIZE, ROW_INDENT } from '../constants'
import { selectBasenameRange } from '../utils/fileUtils'
import { FileTypeIcon } from './FileTypeIcon'
import styles from '../Explorer.module.css'

interface ExplorerRowProps {
  node: FileNode
  level: number
  isSelected: boolean
  isEditing: boolean
  isDragging: boolean
  isDropTarget: boolean
  editValue: string
  onEditValueChange: (value: string) => void
  onSelect: (path: string, mode?: 'single' | 'multi' | 'range') => void
  onToggle: (path: string) => void
  onContextMenu: (event: React.MouseEvent, node: FileNode) => void
  onOpenMenu: (event: React.MouseEvent, node: FileNode) => void
  onDoubleClick: (node: FileNode) => void
  onCommitEdit: (node: FileNode) => void
  onCancelEdit: () => void
  onDragStart: (event: React.DragEvent, node: FileNode) => void
  onDragOver: (event: React.DragEvent, node: FileNode) => void
  onDrop: (event: React.DragEvent, node: FileNode) => void
  onDragEnd: () => void
}

export const ExplorerRow = memo(function ExplorerRow({
  node,
  level,
  isSelected,
  isEditing,
  isDragging,
  isDropTarget,
  editValue,
  onEditValueChange,
  onSelect,
  onToggle,
  onContextMenu,
  onOpenMenu,
  onDoubleClick,
  onCommitEdit,
  onCancelEdit,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: ExplorerRowProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const submittedRef = useRef(false)

  // Al entrar en modo edición: foco + preselección del nombre hasta la extensión.
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      selectBasenameRange(inputRef.current, node.name)
      submittedRef.current = false
    }
  }, [isEditing, node.name])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (submittedRef.current) return
      submittedRef.current = true
      onCommitEdit(node)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      submittedRef.current = true
      onCancelEdit()
    }
  }

  const handleClick = (event: React.MouseEvent): void => {
    const mode = event.ctrlKey || event.metaKey ? 'multi' : event.shiftKey ? 'range' : undefined
    onSelect(node.path, mode)
    if (node.isDirectory) onToggle(node.path)
  }

  const indentPadding = 8 + level * ROW_INDENT

  return (
    <div
      className={[
        styles.row,
        isSelected ? styles.selected : null,
        isDragging ? styles.dragging : null,
        isDropTarget ? styles.dropTarget : null
      ]
        .filter(Boolean)
        .join(' ')}
      data-row-path={node.path}
      style={{ height: ROW_HEIGHT, paddingLeft: indentPadding, fontSize: ROW_FONT_SIZE }}
      onClick={handleClick}
      onContextMenu={(event) => onContextMenu(event, node)}
      onDoubleClick={() => {
        if (!node.isDirectory) onDoubleClick(node)
      }}
      title={node.path}
      draggable={!isEditing}
      onDragStart={(event) => onDragStart(event, node)}
      onDragOver={(event) => onDragOver(event, node)}
      onDrop={(event) => onDrop(event, node)}
      onDragEnd={onDragEnd}
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={node.isDirectory ? node.isExpanded : undefined}
    >
      {/* Guías de indentación, una por nivel. */}
      {Array.from({ length: level }, (_, i) => (
        <span
          key={i}
          className={styles.indentGuide}
          style={{ left: 8 + i * ROW_INDENT + 7 }}
        />
      ))}

      {node.isDirectory ? (
        <span className={styles.arrow} style={{ width: ROW_ICON_SIZE, height: ROW_ICON_SIZE }}>
          {node.isExpanded ? (
            <ChevronDownIcon size={12} />
          ) : (
            <ChevronRightIcon size={12} />
          )}
        </span>
      ) : (
        <span
          className={styles.arrowPlaceholder}
          style={{ width: ROW_ICON_SIZE, height: ROW_ICON_SIZE }}
        />
      )}

      <span
        className={[styles.icon, node.isDirectory ? styles.iconFolder : styles.iconFile]
          .filter(Boolean)
          .join(' ')}
      >
        <FileTypeIcon
          name={node.name}
          isDirectory={node.isDirectory}
          isExpanded={node.isExpanded}
          size={ROW_ICON_SIZE}
        />
      </span>

      {isEditing ? (
        <input
          ref={inputRef}
          className={styles.input}
          style={{ fontSize: ROW_FONT_SIZE }}
          value={editValue}
          onChange={(event) => onEditValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (submittedRef.current) return
            submittedRef.current = true
            // Sin cambios → cancelar (evita un moveFile a sí mismo).
            if (editValue === node.name) onCancelEdit()
            else onCommitEdit(node)
          }}
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        <span className={styles.name}>{node.name}</span>
      )}

      {!isEditing ? (
        <button
          type="button"
          className={styles.dots}
          title="Más acciones"
          aria-label={`Más acciones para ${node.name}`}
          onClick={(event) => {
            event.stopPropagation()
            onOpenMenu(event, node)
          }}
        >
          <MoreHorizontalIcon size={14} />
        </button>
      ) : null}
    </div>
  )
})
