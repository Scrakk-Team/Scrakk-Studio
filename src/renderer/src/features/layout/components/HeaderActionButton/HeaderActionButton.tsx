// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * HeaderActionButton — botón de acción del header de un panel, ARRASTRABLE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA API PARA AGREGAR BOTONES A UN HEADER
 *
 * Un panel monta sus acciones con `setActions(() => <>…</>)`. Cada botón que
 * quiera ser reordenable por el usuario se declara con ESTE componente en vez
 * de un `IconButton` suelto:
 *
 *   setActions(() => (
 *     <>
 *       <HeaderActionButton id="explorer.new-file" label="Nuevo archivo"
 *         icon="new-file" shape="rounded" onClick={…} />
 *       <HeaderActionButton id="explorer.refresh" label="Actualizar"
 *         icon="refresh" shape="rounded" onClick={…} />
 *     </>
 *   ))
 *
 * `id` es global y namespaced (`<panel>.<accion>`): es lo que el store
 * (`state/headerActions.ts`) persiste. El resto de las props se reenvían al
 * `IconButton` (mismo look, mismos variants/hover), así que migrar un botón es
 * cambiar el componente y agregarle un `id`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL DRAG ES EL DE LA ACTIVITY BAR, EN HORIZONTAL
 *
 * Mismo mecanismo, tomado de `features/activitybar/ActivityBar.tsx`:
 *
 *   pointerdown → se arma el drag (umbral de 6px para no comerse el click) →
 *   pointermove → `elementFromPoint` no hace falta (el header es una fila):
 *   se calcula el índice por MITADES de cada botón y se reordena EN VIVO →
 *   pointerup/pointercancel cierra · Escape restaura el snapshot.
 *
 * Detalles que se copian a propósito:
 *  - Umbral: un click simple NO dragea (el botón sigue haciendo su acción).
 *  - `suppressClickRef`: el `pointerup` precede al `click`, así que el click
 *    que sigue a un drag se traga una vez (si no, el drag dispara la acción).
 *  - Fantasma que sigue al cursor: identifica qué se está moviendo.
 *  - `cursor: grabbing` en el body y sin selección de texto mientras dura.
 *
 * El botón de CERRAR del frame no usa esto: es mobiliario del host, no una
 * acción del panel (ver PanelFrame).
 */

import { useRef, useState, type ComponentPropsWithoutRef, type JSX, type ReactNode } from 'react'
import { IconButton } from '@ui'
import { ProductIcon } from '@services/productIcons/components'
import {
  moveHeaderAction,
  restoreHeaderActions,
  snapshotHeaderActions
} from '../../state/headerActions'
import styles from './HeaderActionButton.module.css'

/** Px de movimiento antes de promover a drag (igual que la activity bar). */
const DRAG_THRESHOLD = 6

/** Contenedor del header que define el alcance del reorden. */
const CONTAINER_ATTR = 'data-header-actions'

/** Atributo que marca un botón como reordenable (lo escribe este componente). */
const ACTION_ATTR = 'data-header-action'

export interface HeaderActionButtonProps extends Omit<ComponentPropsWithoutRef<'button'>, 'id'> {
  /** Id global namespaced de la acción (`explorer.refresh`). */
  id: string
  /** Tooltip + aria-label (igual que IconButton). */
  label: string
  /** Orden declarado (default: la posición en el JSX × 10). */
  order?: number
  /** Ícono por id de productIcons — atajo de `children`. */
  icon?: string
  /** Grados de rotación del ícono (p. ej. chevron para "Volver"). */
  iconRotation?: number
  variant?: 'neutral' | 'accent' | 'danger'
  size?: 'sm' | 'md'
  shape?: 'circle' | 'rounded'
  children?: ReactNode
}

/**
 * Ids de las acciones presentes en el contenedor, en el orden del DOM.
 * Es la fuente real del reorden: el store no conoce el header, sólo ids.
 */
function idsIn(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>(`[${ACTION_ATTR}]`))
    .map((element) => element.getAttribute(ACTION_ATTR) ?? '')
    .filter((id) => id.length > 0)
}

/** Índice de inserción bajo el cursor: mitades horizontales de cada botón. */
function indexAt(container: HTMLElement, x: number, skipId: string): number {
  let index = 0
  for (const element of container.querySelectorAll<HTMLElement>(`[${ACTION_ATTR}]`)) {
    const id = element.getAttribute(ACTION_ATTR)
    if (!id || id === skipId) continue
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0) continue
    if (x > rect.left + rect.width / 2) index++
    else break
  }
  return index
}

export function HeaderActionButton({
  id,
  label,
  order,
  icon,
  iconRotation,
  variant,
  size = 'sm',
  shape,
  className,
  onClick,
  children,
  ...rest
}: HeaderActionButtonProps): JSX.Element {
  const [dragging, setDragging] = useState(false)
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)
  /** El `pointerup` precede al `click`: hay que tragarse el click del drag. */
  const suppressClick = useRef(false)
  const listenersRef = useRef<(() => void) | null>(null)

  function endDrag(restore: boolean, snapshot: string): void {
    listenersRef.current?.()
    listenersRef.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    if (restore) restoreHeaderActions(snapshot)
    setDragging(false)
    setGhost(null)
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>): void {
    if (event.button !== 0) return
    const container = event.currentTarget.closest(`[${CONTAINER_ATTR}]`) as HTMLElement | null
    if (!container) return

    const startX = event.clientX
    const startY = event.clientY
    const snapshot = snapshotHeaderActions()
    let started = false

    const onMove = (moveEvent: PointerEvent): void => {
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY
      if (!started) {
        if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return
        started = true
        suppressClick.current = true
        setDragging(true)
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
      }
      setGhost({ x: moveEvent.clientX, y: moveEvent.clientY })
      // Reorden EN VIVO: la fila se acomoda con el cursor (estilo VS Code).
      // El id arrastrado sigue en el DOM (idsIn lo incluye); el store lo saca.
      moveHeaderAction(id, indexAt(container, moveEvent.clientX, id), idsIn(container))
    }

    const onUp = (): void => {
      if (started) suppressClick.current = true
      endDrag(false, snapshot)
    }

    const onKey = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key !== 'Escape' || !started) return
      keyEvent.preventDefault()
      suppressClick.current = true
      endDrag(true, snapshot)
    }

    const cleanup = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey, true)
    }
    listenersRef.current = cleanup
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey, true)
  }

  return (
    <IconButton
      label={label}
      variant={variant}
      size={size}
      shape={shape}
      className={[className, dragging ? styles.dragging : null].filter(Boolean).join(' ')}
      data-header-action={id}
      data-header-order={order}
      {...rest}
      onPointerDown={handlePointerDown}
      onClick={(clickEvent) => {
        if (suppressClick.current) {
          suppressClick.current = false
          return
        }
        onClick?.(clickEvent)
      }}
    >
      {children ??
        (icon ? (
          <ProductIcon
            id={icon}
            size={16}
            style={iconRotation ? { transform: `rotate(${iconRotation}deg)` } : undefined}
          />
        ) : null)}
      {ghost ? (
        <span
          className={styles.ghost}
          style={{ left: ghost.x, top: ghost.y }}
          aria-hidden="true"
        >
          {icon ? <ProductIcon id={icon} size={16} /> : null}
        </span>
      ) : null}
    </IconButton>
  )
}
