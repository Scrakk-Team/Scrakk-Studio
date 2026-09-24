// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Headers de tabs — puente entre los headers de paneles y el strip.
 *
 * Problema: cuando un panel vive como UNA tab más de un strip multi-tab, no
 * hay PanelFrame arriba y sus acciones de header (`setActions`) quedan
 * invisibles. Solución: el `PanelTitleAutoProvider` publica aquí
 * `{title, actions}` con clave `stripId:tabId`; el TabStrip lee la entrada de
 * la tab ACTIVA y su botón ⋯ las muestra en el menú contextual global.
 *
 * Las opciones se DETECTAN automáticamente del ReactNode de acciones (sin
 * hardcodear ninguna): se camina el árbol de elementos y todo botón con
 * `onClick` + etiqueta accesible (`label`/`aria-label`/`title`/texto) se
 * vuelve un ítem (con su ícono, `disabled` y `danger`).
 */

import { Children, Fragment, createElement, isValidElement, type ReactNode } from 'react'
import type { ContextMenuItem } from '@ui'
import { ProductIcon } from '@services/productIcons/components'

export interface TabHeaderEntry {
  title: string
  /** Render de acciones del header (el mismo que pintaría el PanelFrame). */
  actions: () => ReactNode
}

type Listener = () => void

const entries = new Map<string, TabHeaderEntry>()
const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Suscriptor roto no tumba a los demás.
    }
  }
}

export function tabHeaderKey(stripId: string, tabId: string): string {
  return `${stripId}:${tabId}`
}

/** Publica (o retira con null) el header de una tab. Solo emite si cambió. */
export function setTabHeader(key: string, entry: TabHeaderEntry | null): void {
  const had = entries.has(key)
  if (entry === null) {
    if (!had) return
    entries.delete(key)
    emit()
    return
  }
  const prev = entries.get(key)
  if (prev?.title === entry.title && prev?.actions === entry.actions) return
  entries.set(key, entry)
  emit()
}

export function getTabHeader(key: string): TabHeaderEntry | null {
  return entries.get(key) ?? null
}

export function subscribeTabHeaders(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Solo tests: limpia el registro. */
export function _resetTabHeadersForTests(): void {
  entries.clear()
  listeners.clear()
}

// ── Extracción automática de opciones ──────────────────────────────────────

/** Evento mínimo para handlers que esperan el click (nunca truena). */
const STUB_EVENT = {
  stopPropagation: (): void => {},
  preventDefault: (): void => {}
}

function textOf(node: ReactNode): string {
  let out = ''
  Children.toArray(node).forEach((child) => {
    if (typeof child === 'string' || typeof child === 'number') out += String(child)
    else if (isValidElement(child)) out += textOf((child.props as { children?: ReactNode }).children)
  })
  return out.trim()
}

interface LooseProps {
  label?: unknown
  icon?: unknown
  onClick?: unknown
  disabled?: unknown
  danger?: unknown
  variant?: unknown
  title?: unknown
  children?: ReactNode
  [key: string]: unknown
}

function extractFromNode(node: ReactNode, out: ContextMenuItem[]): void {
  Children.toArray(node).forEach((child) => {
    if (!isValidElement(child)) return
    const props = child.props as LooseProps
    // Fragmentos: bajar sin nivel extra.
    if (child.type === Fragment) {
      extractFromNode(props.children, out)
      return
    }
    if (typeof props.onClick === 'function') {
      const onClick = props.onClick as (event?: unknown) => void
      const rawLabel =
        typeof props.label === 'string' && props.label.length > 0
          ? props.label
          : typeof props['aria-label'] === 'string' && (props['aria-label'] as string).length > 0
            ? (props['aria-label'] as string)
            : typeof props.title === 'string' && props.title.length > 0
              ? props.title
              : textOf(props.children)
      if (rawLabel.length === 0) return
      const iconNode = isValidElement(props.children)
        ? (props.children as ReactNode)
        : typeof props.icon === 'string' && props.icon.length > 0
          ? // `HeaderActionButton` con el atajo `icon="refresh"`: el id se
            // resuelve al mismo ícono que pinta el header, así el menú ⋯ no
            // pierde los íconos al migrar un botón a la API drageable.
            createElement(ProductIcon, { id: props.icon, size: 14 })
          : isValidElement(props.icon)
            ? (props.icon as ReactNode)
            : undefined
      out.push({
        label: rawLabel,
        ...(iconNode ? { icon: iconNode } : {}),
        disabled: props.disabled === true,
        danger: props.danger === true || props.variant === 'danger',
        onClick: () => {
          try {
            onClick(STUB_EVENT)
          } catch {
            // Handler roto: no tumbar el menú.
          }
        }
      })
      return
    }
    // Contenedor sin acción (div/span): buscar botones adentro.
    if (props.children !== undefined && props.children !== null) {
      extractFromNode(props.children, out)
    }
  })
}

/**
 * Convierte las acciones del header en ítems de menú contextual.
 * Automático: sirve para explorer, chat, notas… sin conocer ninguno.
 */
export function extractHeaderMenuItems(entry: TabHeaderEntry | null): ContextMenuItem[] {
  if (!entry) return []
  let rendered: ReactNode = null
  try {
    rendered = entry.actions()
  } catch {
    return []
  }
  const out: ContextMenuItem[] = []
  extractFromNode(rendered, out)
  return out
}
