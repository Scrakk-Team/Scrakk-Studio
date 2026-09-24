// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { ProductIcon } from '@services/productIcons/components'
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type JSX,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react'
import { useDndState, useDropZone } from '@features/dnd'
import { subscribeToFileIcons } from '@services/fileIcons'
import { showContextMenu } from '@features/editor/engines/innerta/menuHost'
import { getFileSession, hasFileSession, isFileDirty } from '@features/editor/fileSession'
import { tabsStore } from './store'
import {
  extractHeaderMenuItems,
  getTabHeader,
  subscribeTabHeaders,
  tabHeaderKey
} from './tabHeaders'
import type { StripId, TabSpec } from './types'
import styles from './TabStrip.module.css'

interface TabStripProps {
  /** Strip que renderiza (sus tabs + activa vienen del tabsStore). */
  stripId: StripId
  /**
   * Ícono decorativo por tab (el strip es agnóstico: la tab pudo traer su
   * propio icon, o el host resuelve el default por kind aquí).
   */
  iconFor?: (tab: TabSpec) => ComponentType<{ size?: number }> | undefined
  /** Al activar una tab (default: tabsStore.activateTab). */
  onActivate?: (tab: TabSpec, stripId: StripId) => void
  /** Al cerrar una tab (default: tabsStore.closeTab). */
  onClose?: (tab: TabSpec, stripId: StripId) => void
  /**
   * Acción custom del botón "+" al final del strip (p.ej. terminal nueva
   * en el slot inferior). Sin esto no se muestra el botón.
   */
  onAddTab?: () => void
  /** Etiqueta accesible del "+" (default según idioma del host). */
  addTabLabel?: string
  /**
   * Acciones custom del contenedor derecho del strip (máx 4): botones con
   * icono y función propios definidos por el caller (p.ej. vista de nodos
   * en el slot inferior). Sin acciones no se muestra el contenedor.
   */
  actions?: StripAction[]
}

/** Botón custom del contenedor derecho de un TabStrip. */
export interface StripAction {
  id: string
  /** Etiqueta accesible. */
  label: string
  /** Tooltip (default: label). */
  title?: string
  /** Icono custom (nodo React ya resuelto por el caller). */
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
}

/** Tope de acciones por strip (el contenedor derecho no crece sin fin). */
export const MAX_STRIP_ACTIONS = 4

interface TabItemProps {
  tab: TabSpec
  stripId: StripId
  index: number
  active: boolean
  icon?: ComponentType<{ size?: number }>
  /**
   * Cadena de la tab DUEÑA (índice 0): los íconos + labels del resto de las
   * tabs del strip unidos por ⇄. SOLO se muestra cuando el contenido del
   * strip está DIVIDIDO (split): representa los paneles (Chat ⇄ Terminal).
   * En un stack normal la barra muestra tabs sueltas, sin cadena.
   */
  chain?: Array<{ icon?: ComponentType<{ size?: number }>; label: string }>
  /** La tab es la fuente del drag actual (feedback visual). */
  dragging: boolean
  onSelect: () => void
  onClose: () => void
}

/**
 * Una tab del strip. Registra su propia zona de drop (before/after según la
 * mitad de su ancho). El drag arranca en el pointerdown y lo resuelve la
 * sesión global de dnd; un click simple selecciona la tab.
 */
function TabItem({
  tab,
  stripId,
  index,
  active,
  icon,
  chain,
  dragging,
  onSelect,
  onClose
}: TabItemProps): JSX.Element {
  const zone = useDropZone({ kind: 'tab', stripId, tabIndex: index })
  const Icon = icon
  const closeRef = useRef<HTMLSpanElement | null>(null)

  // Dirty de la tab de archivo: punto que reemplaza la X al hover (VS Code).
  // Estado vive en la sesión del archivo; aquí solo se suscribe y refleja.
  const filePath = tab.kind === 'file' ? tab.filePath : undefined
  const [dirty, setDirty] = useState<boolean>(() => (filePath ? isFileDirty(filePath) : false))
  useEffect(() => {
    if (!filePath) return
    setDirty(isFileDirty(filePath))
    if (!hasFileSession(filePath)) return
    return getFileSession(filePath).onDidChangeDirty(setDirty)
  }, [filePath])

  // El glifo de la X (11px, trazos finos) se rasteriza asimétrico si cae en
  // una posición fraccionaria de device pixel — cada tab cae en una fracción
  // distinta, por eso la X "no siempre se ve centrada". Encajamos el svg al
  // device pixel más cercano: en todas las tabs se rasteriza idéntico.
  useLayoutEffect(() => {
    const snap = (): void => {
      const svg = closeRef.current?.querySelector('svg')
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return
      const dpr = window.devicePixelRatio || 1
      const x = Math.round(rect.left * dpr) / dpr - rect.left
      const y = Math.round(rect.top * dpr) / dpr - rect.top
      svg.style.transform = `translate(${x}px, ${y}px)`
    }
    snap()
    window.addEventListener('scroll', snap, true)
    window.addEventListener('resize', snap)
    return () => {
      window.removeEventListener('scroll', snap, true)
      window.removeEventListener('resize', snap)
    }
  }, [index])
  const classes = [styles.tab, active ? styles.tabActive : null, dragging ? styles.tabDragging : null]
    .filter(Boolean)
    .join(' ')

  // Drag DECLARATIVO: el detector global de [data-drag-header] convierte la
  // tab en manija con solo estos atributos (el <button> ES el header). La X
  // interna lleva [data-drag-ignore] para que su click siga cerrando.
  const dragAttrs = tab.fixed
    ? null
    : {
        'data-drag-header': '',
        'data-drag-strip': stripId,
        'data-drag-tab': tab.id,
        'data-drag-label': tab.label
      }

  return (
    <button
      ref={zone.ref}
      type="button"
      role="tab"
      aria-selected={active}
      className={classes}
      style={
        dragging
          ? { position: 'relative', zIndex: 10, cursor: 'grabbing', opacity: 0.45 }
          : undefined
      }
      onClick={() => onSelect()}
      {...dragAttrs}
    >
      {Icon ? <Icon size={14} aria-hidden="true" /> : null}
      <span className={styles.label}>{tab.label}</span>
      {chain
        ? chain.map((item, i) => (
            <Fragment key={i}>
              <span className={styles.chainSep} aria-hidden="true">
                ⇄
              </span>
              {item.icon ? <item.icon size={14} aria-hidden="true" /> : null}
              <span className={styles.chainItem}>{item.label}</span>
            </Fragment>
          ))
        : null}
      {tab.closable !== false && !tab.fixed ? (
        <span
          ref={closeRef}
          role="button"
          aria-label={
            dirty ? `Cerrar ${tab.label ?? ''} (con cambios sin guardar)` : `Cerrar ${tab.label ?? ''}`
          }
          className={dirty ? `${styles.close} ${styles.closeDirty}` : styles.close}
          data-drag-ignore=""
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
        >
          <span className={styles.dirtyDot} aria-hidden="true" />
          <ProductIcon id="x" size={11} aria-hidden="true" />
        </span>
      ) : null}
    </button>
  )
}

/** Labels default por kind (solo si el spec no trae label). */
function defaultLabel(tab: TabSpec): string {
  if (tab.label) return tab.label
  switch (tab.kind) {
    case 'welcome':
      return 'Bienvenida'
    case 'file':
      return tab.filePath?.split(/[/\\]/).pop() ?? 'Archivo'
    case 'terminal':
      return 'Terminal'
    case 'panel':
      return tab.panelId ?? 'Panel'
    case 'explorer':
      return tab.rootPath?.split(/[/\\]/).filter(Boolean).pop() ?? 'Explorador'
  }
}

/**
 * Barra de tabs de un strip — genérica. Lee el estado del tabsStore y
 * renderiza las tabs (visuales del antiguo strip central, idénticas) con
 * drag & drop genérico: cualquier tab no fija se arrastra a cualquier zona
 * de tabs del layout (reorden en el mismo strip o mover a otra strip).
 *
 * El indicador de inserción (gap de acento) se muestra en vivo bajo el
 * cursor; el reorden/traslado se ejecuta al soltar (drop resolver).
 */
export function TabStrip({ stripId, iconFor, onActivate, onClose, onAddTab, addTabLabel, actions }: TabStripProps): JSX.Element | null {
  const [version, setVersion] = useState(0)
  const drag = useDndState()

  // Re-render ante cualquier mutación del store + cambio de tema de iconos
  // + publicación de headers de tabs (para el botón ⋯).
  useEffect(
    () =>
      tabsStore.subscribe(() => {
        setVersion((v) => v + 1)
      }),
    []
  )
  useEffect(() => subscribeToFileIcons(() => setVersion((v) => v + 1)), [])
  useEffect(() => subscribeTabHeaders(() => setVersion((v) => v + 1)), [])
  void version

  const strip = tabsStore.getStrip(stripId)
  const tabs = strip?.tabs ?? []
  // La cadena ⇄ de la dueña SOLO representa un contenido PARTIDO (un panel
  // por tab). Un stack normal (misma strip, tab activa) muestra tabs sueltas.
  const splitActive = !!strip?.splitDir && tabs.length >= 2

  const draggingTabId =
    drag.phase === 'dragging' && drag.payload?.type === 'tab' ? drag.payload.tabId : null

  // Zona de drop del strip completo (para el indicador cuando el cursor está
  // sobre el strip, no sobre una tab puntual).
  const stripZone = useDropZone({ kind: 'strip', stripId })

  // Ref combinado ESTABLE: si el callback cambia de identidad en cada render,
  // React hace detach/attach del ref y cada uno llama setState (useDropZone) →
  // loop de updates ("Maximum update depth exceeded") con muchos strips.
  const tabsRef = useRef<HTMLDivElement | null>(null)
  const stripRef = stripZone.ref
  const setTabsNode = useCallback(
    (el: HTMLDivElement | null) => {
      tabsRef.current = el
      stripRef(el)
    },
    [stripRef]
  )

  // Scroll horizontal con la RUEDA sobre el strip: cuando las tabs desbordan
  // (el contenedor las tapa), la rueda las revela. Listener nativo NO pasivo
  // para poder frenar el scroll de la página.
  useEffect(() => {
    const el = tabsRef.current
    if (!el) return undefined
    const onWheel = (event: WheelEvent): void => {
      if (el.scrollWidth <= el.clientWidth) return
      const delta =
        Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      if (delta === 0) return
      event.preventDefault()
      el.scrollLeft += delta
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // Se reengancha cuando aparecen tabs (sin tabs el componente no monta el
    // contenedor, así que un effect con deps [] no encontraría el elemento).
  }, [tabs.length])

  const handleSelect = useCallback(
    (tab: TabSpec): void => {
      if (drag.phase === 'dragging' && drag.payload?.tabId === tab.id) return
      if (onActivate) onActivate(tab, stripId)
      else tabsStore.activateTab(stripId, tab.id)
    },
    [drag.phase, drag.payload?.tabId, onActivate, stripId]
  )

  const handleClose = useCallback(
    (tab: TabSpec): void => {
      if (onClose) onClose(tab, stripId)
      else tabsStore.closeTab(stripId, tab.id)
    },
    [onClose, stripId]
  )

  const dragTarget = drag.phase === 'dragging' ? drag.target : null
  const target =
    dragTarget?.stripId === stripId
      ? dragTarget
      : drag.resourceTarget?.stripId === stripId
        ? drag.resourceTarget
        : null
  // La rayita también aparece para el drag nativo del explorador (mismo indicador).
  const showGap = !!target && !target.split

  if (tabs.length === 0) return null

  const rendered: JSX.Element[] = []
  tabs.forEach((tab, index) => {
    if (showGap && target!.index === index) {
      rendered.push(<span key={`gap-${index}`} className={styles.gap} aria-hidden="true" />)
    }
    const icon = tab.icon ?? iconFor?.(tab)
    // La tab DUEÑA (primera del strip) muestra la cadena ⇄ SOLO cuando el
    // contenido está dividido (split): en un stack normal es una tab más.
    const chain =
      index === 0 && splitActive
        ? tabs.slice(1).map((t) => ({
            icon: t.icon ?? iconFor?.(t),
            label: defaultLabel(t)
          }))
        : undefined
    rendered.push(
      <TabItem
        key={tab.id}
        tab={{ ...tab, label: defaultLabel(tab) }}
        stripId={stripId}
        index={index}
        active={strip?.activeId === tab.id}
        icon={icon}
        chain={chain}
        dragging={draggingTabId === tab.id}
        onSelect={() => handleSelect(tab)}
        onClose={() => handleClose(tab)}
      />
    )
  })
  if (showGap && target!.index >= tabs.length) {
    rendered.push(<span key="gap-end" className={styles.gap} aria-hidden="true" />)
  }

  // Acciones del header de la tab ACTIVA (las que se pierden sin PanelFrame):
  // se detectan solas del render de acciones publicado por el panel.
  const activeTab = strip?.activeId ? tabs.find((t) => t.id === strip.activeId) ?? null : null
  const overflowItems =
    activeTab && !splitActive
      ? extractHeaderMenuItems(getTabHeader(tabHeaderKey(stripId, activeTab.id)))
      : []

  const openOverflowMenu = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    const entry = activeTab ? getTabHeader(tabHeaderKey(stripId, activeTab.id)) : null
    const items = extractHeaderMenuItems(entry)
    if (items.length === 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX || rect.left
    const y = event.clientY || rect.bottom
    showContextMenu(x, y, items)
  }

  return (
    <div className={styles.strip}>
      <div
        ref={setTabsNode}
        className={styles.tabs}
        role="tablist"
        aria-label="Tabs abiertas"
      >
        {rendered}
        {onAddTab ? (
          <button
            type="button"
            className={styles.addTab}
            aria-label={addTabLabel ?? 'Nueva tab'}
            title={addTabLabel ?? 'Nueva tab'}
            onClick={onAddTab}
          >
            <ProductIcon id="plus" size={15} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {overflowItems.length > 0 ? (
        <button
          type="button"
          className={styles.overflow}
          aria-label={`Opciones de ${activeTab?.label ?? 'la tab activa'}`}
          title="Opciones de la tab activa"
          onClick={openOverflowMenu}
        >
          <ProductIcon id="more" size={15} aria-hidden="true" />
        </button>
      ) : null}
      {actions && actions.length > 0 ? (
        <div className={styles.stripActions} role="toolbar" aria-label="Acciones del strip">
          {actions.slice(0, MAX_STRIP_ACTIONS).map((action) => (
            <button
              key={action.id}
              type="button"
              className={styles.stripAction}
              aria-label={action.label}
              title={action.title ?? action.label}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.icon}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
