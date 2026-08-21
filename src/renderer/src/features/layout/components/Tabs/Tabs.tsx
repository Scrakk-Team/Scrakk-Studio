import { FileIcon, HomeIcon, XIcon } from '@proicons/react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type JSX
} from 'react'
import {
  activateFile,
  clearActiveFile,
  closeFile,
  getEditorFiles,
  moveFileTab,
  subscribeToEditorFiles,
  type EditorFileTab
} from '@features/editor'
import { ExtensionRegistry } from '@services/extensions'
import { useLayout, getPanel } from '@features/layout'
import styles from './Tabs.module.css'

/** Distancia mínima (px) antes de que un pointerdown pase a ser drag. */
const DRAG_THRESHOLD = 4

interface TabEntry {
  id: string
  label: string
  icon?: ComponentType<{ size?: number }>
  /** Solo los archivos tienen botón de cerrar. */
  closable: boolean
  /** Para tabs de extensión: panel que monta su contenido en el centro. */
  panelId?: string
}

interface TabItemProps {
  tab: TabEntry
  index: number
  active: boolean
  isDragging: boolean
  dragStyle: CSSProperties
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onPointerDown: (event: PointerEvent, id: string, index: number) => void
  registerRef: (id: string, element: HTMLButtonElement | null) => void
}

/**
 * Una tab del strip. El drag arranca acá (pointerdown) pero el movimiento y el
 * fin del drag se escuchan a nivel window: no depende de que el nodo, que
 * además se reordena en el DOM durante el arrastre, conserve el capture.
 */
function TabItem({
  tab,
  index,
  active,
  isDragging,
  dragStyle,
  onSelect,
  onClose,
  onPointerDown,
  registerRef
}: TabItemProps): JSX.Element {
  const Icon = tab.icon
  const classes = [
    styles.tab,
    active ? styles.tabActive : null,
    isDragging ? styles.tabDragging : null
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      ref={(element) => registerRef(tab.id, element)}
      type="button"
      role="tab"
      aria-selected={active}
      className={classes}
      style={
        isDragging
          ? { ...dragStyle, position: 'relative', zIndex: 10, cursor: 'grabbing' }
          : undefined
      }
      onClick={() => onSelect(tab.id)}
      onPointerDown={(event) => onPointerDown(event.nativeEvent, tab.id, index)}
    >
      {Icon ? <Icon size={14} aria-hidden="true" /> : null}
      <span className={styles.label}>{tab.label}</span>
      {tab.closable ? (
        <span
          role="button"
          aria-label={`Cerrar ${tab.label}`}
          className={styles.close}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onClose(tab.id)
          }}
        >
          <XIcon size={11} aria-hidden="true" />
        </span>
      ) : null}
    </button>
  )
}

/**
 * Barra de tabs del área central — "Bienvenida", una tab transitoria para el
 * panel abierto en el centro (si hay) y los archivos abiertos. La tab
 * transitoria la abre una ACCIÓN (activity bar o botón dentro de un panel);
 * las extensiones nunca montan tabs por defecto. Es closable.
 *
 * El drag arrastra la tab REAL: mientras se mueve se traduce siguiendo al
 * cursor (clampada al strip) y las demás se corren EN VIVO al cruzar sus
 * puntos medios. Un click simple (sin superar el umbral de 4px) selecciona
 * la tab; el drag solo arranca superado ese umbral.
 */
export function Tabs(): JSX.Element | null {
  const { slots, setSlotPanel } = useLayout()
  const stripRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const [files, setFiles] = useState<EditorFileTab[]>(() => getEditorFiles().openFiles)
  const [activePath, setActivePath] = useState<string | null>(() => getEditorFiles().activePath)
  const [drag, setDrag] = useState<{ id: string; index: number } | null>(null)
  const [dragTransform, setDragTransform] = useState(0)
  const cursorXRef = useRef(0)
  const suppressClickRef = useRef(false)
  const pendingRef = useRef<{ id: string; index: number; startX: number; startY: number } | null>(null)
  /** Espejo de `drag` para listeners a nivel window sin closures stale. */
  const dragRef = useRef<{ id: string; index: number } | null>(null)
  /** Última lista de tabs (actualizada cada render) para el reorden en vivo. */
  const tabsRef = useRef<TabEntry[]>([])
  /** Tab central abierta EN VIVO (para callbacks sin closures stale). */
  const centerTabRef = useRef<TabEntry | null>(null)

  // Re-render cuando cambia el registry de extensiones (tab/metadata nueva).
  const [registryVersion, setRegistryVersion] = useState(0)
  useEffect(
    () => ExtensionRegistry.subscribe(() => setRegistryVersion((v) => v + 1)),
    []
  )

  // Tab transitoria: la del panel montado en el slot central. Nace de una
  // ACCIÓN (botón de la activity bar o botón dentro del propio panel) — las
  // extensiones nunca montan tabs por defecto en el strip. Es closable.
  const centerTab: TabEntry | null = useMemo(() => {
    const open = slots.center
    if (!open || open === 'welcome' || open === 'editor') return null
    const declared = ExtensionRegistry.getCenterTabs().find((tab) => tab.id === open)
    if (declared) {
      return {
        id: declared.id,
        label: declared.label,
        icon: declared.icon,
        closable: true,
        panelId: declared.panelId
      }
    }
    return {
      id: open,
      label: getPanel(open)?.title ?? open,
      closable: true,
      panelId: open
    }
  }, [slots.center, registryVersion])
  centerTabRef.current = centerTab

  // Estado de file-tabs (store externo de @features/editor).
  useEffect(
    () =>
      subscribeToEditorFiles(({ openFiles, activePath: nextActive }) => {
        setFiles(openFiles)
        setActivePath(nextActive)
      }),
    []
  )

  const registerRef = useCallback((id: string, element: HTMLButtonElement | null) => {
    if (element) tabRefs.current.set(id, element)
    else tabRefs.current.delete(id)
  }, [])

  const tabs: TabEntry[] = [
    { id: 'welcome', label: 'Bienvenida', icon: HomeIcon, closable: false },
    ...(centerTab ? [centerTab] : []),
    ...files.map((file) => ({
      id: file.path,
      label: file.name,
      icon: FileIcon,
      closable: true
    }))
  ]
  tabsRef.current = tabs

  // El centro muestra el editor cuando hay un archivo activo; si no, Bienvenida.
  useEffect(() => {
    if (activePath && slots.center !== 'editor') setSlotPanel('center', 'editor')
    else if (!activePath && slots.center === 'editor') setSlotPanel('center', 'welcome')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath])

  // Mueve una tab de un índice a otro (reorden EN VIVO durante el drag).
  // "Bienvenida" y la tab central transitoria quedan fijas; el reorden solo
  // afecta a los archivos (que arrancan tras ellas).
  const moveTab = useCallback((from: number, to: number) => {
    const tabs = tabsRef.current
    const count = tabs.length
    const fileStart = 1 + (centerTabRef.current ? 1 : 0)
    if (from < fileStart || to < fileStart || from >= count || to >= count) return
    const fileFrom = from - fileStart
    const fileTo = Math.min(to - fileStart, count - fileStart - 1)
    if (fileFrom === fileTo) return
    moveFileTab(fileFrom, fileTo)
  }, [])

  // Translate de la tab arrastrada: la mantiene bajo el cursor, clampada al
  // strip. offsetLeft es la posición de flow REAL (el transform no la cambia),
  // así que el valor es estable aunque el nodo se reordene.
  const computeTransform = useCallback((): void => {
    const strip = stripRef.current
    const dragged = dragRef.current
    const element = dragged ? tabRefs.current.get(dragged.id) : null
    if (!strip || !element) return
    const stripRect = strip.getBoundingClientRect()
    const pad = 4
    const width = element.offsetWidth
    const minX = stripRect.left + pad
    const maxX = stripRect.right - width - pad
    const desiredLeft = Math.min(Math.max(cursorXRef.current - width / 2, minX), maxX)
    const flowLeft = stripRect.left + element.offsetLeft
    setDragTransform(desiredLeft - flowLeft)
  }, [])

  // Pointerdown: registra la tab como candidata a drag. No se arrastra todavía:
  // solo al superar DRAG_THRESHOLD el pointermove promueve el drag. Un click
  // simple (sin mover) sigue llegando como click y selecciona la tab.
  const handlePointerDown = useCallback((event: PointerEvent, id: string, index: number) => {
    if (event.button !== 0 || dragRef.current) return
    // Bienvenida y la tab central transitoria no se arrastran (solo se
    // reordenan archivos).
    if (id === 'welcome' || centerTabRef.current?.id === id) return
    suppressClickRef.current = false
    pendingRef.current = { id, index, startX: event.clientX, startY: event.clientY }
  }, [])

  // Drag escuchado a nivel window (siempre montado; lee todo de refs, así no
  // hay closures stale ni re-suscripciones por render).
  useEffect(() => {
    const onPointerMove = (event: PointerEvent): void => {
      cursorXRef.current = event.clientX

      const current = dragRef.current
      if (!current) {
        // Promoción a drag: superado el umbral de movimiento.
        const pending = pendingRef.current
        if (!pending) return
        const dx = event.clientX - pending.startX
        const dy = event.clientY - pending.startY
        if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return
        dragRef.current = { id: pending.id, index: pending.index }
        pendingRef.current = null
        suppressClickRef.current = true
        setDrag(dragRef.current)
        setDragTransform(0)
        return
      }

      // Índice de inserción: cuántas tabs (sin la arrastrada) tienen su punto
      // medio a la izquierda del cursor.
      const currentTabs = tabsRef.current
      let target = 0
      for (let i = 0; i < currentTabs.length; i++) {
        const id = currentTabs[i].id
        if (id === current.id) continue
        const element = tabRefs.current.get(id)
        if (!element) continue
        const rect = element.getBoundingClientRect()
        if (event.clientX > rect.left + rect.width / 2) target++
        else break
      }
      if (target !== current.index) {
        moveTab(current.index, target)
        const next = { id: current.id, index: target }
        dragRef.current = next
        setDrag(next)
      }
      computeTransform()
      suppressClickRef.current = true
    }

    const onPointerUp = (): void => {
      pendingRef.current = null
      dragRef.current = null
      setDrag(null)
      setDragTransform(0)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [moveTab, computeTransform])

  // Tras cada commit de layout (reorden), corrige el translate contra el flow
  // ya actualizado: evita el salto de un frame al cruzar un punto medio.
  useLayoutEffect(() => {
    if (!dragRef.current) return
    computeTransform()
  }, [files, drag, computeTransform])

  // Un drag real no debe seleccionar la tab al soltar.
  const handleSelect = useCallback(
    (id: string) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return
      }
      if (id === 'welcome') {
        // Desactiva el archivo: solo la tab de Bienvenida queda activa.
        clearActiveFile()
        setSlotPanel('center', 'welcome')
      } else if (centerTabRef.current?.id === id) {
        // Tab central transitoria: re-monta su panel en el slot central.
        const panelId = centerTabRef.current.panelId
        if (panelId) setSlotPanel('center', panelId)
      } else {
        activateFile(id)
        setSlotPanel('center', 'editor')
      }
    },
    [setSlotPanel]
  )

  const handleClose = useCallback(
    (id: string) => {
      if (centerTabRef.current?.id === id) {
        // Cerrar la tab transitoria: el centro vuelve al editor o Bienvenida.
        setSlotPanel('center', activePath ? 'editor' : 'welcome')
      } else {
        closeFile(id)
      }
    },
    [activePath, setSlotPanel]
  )

  if (tabs.length === 0) return null

  return (
    <div
      ref={stripRef}
      className={styles.tabs}
      role="tablist"
      aria-label="Archivos abiertos"
    >
      {tabs.map((tab, index) => (
        <TabItem
          key={tab.id}
          tab={tab}
          index={index}
          active={
            tab.id === 'welcome'
              ? slots.center === 'welcome'
              : tab.panelId
                ? slots.center === tab.panelId
                : slots.center === 'editor' && tab.id === activePath
          }
          isDragging={drag?.id === tab.id}
          dragStyle={{ transform: `translateX(${dragTransform}px)` }}
          onSelect={handleSelect}
          onClose={handleClose}
          onPointerDown={handlePointerDown}
          registerRef={registerRef}
        />
      ))}
    </div>
  )
}