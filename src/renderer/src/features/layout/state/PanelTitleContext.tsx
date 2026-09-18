/**
 * Header dinámico del panel — título + acciones.
 *
 * Cualquier panel puede cambiar el título de su header con
 * `usePanelTitle().setTitle(...)` (ej. el Explorer muestra el nombre de la
 * carpeta abierta) y montar botones de acción con `setActions(render)` que
 * se dibujan a la derecha del título (ej. los botones del Explorer viven en
 * el propio header, no en una barra aparte). PanelFrame provee el contexto
 * con el título inicial del registro.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL TÍTULO DEL HOST MANDA CUANDO CAMBIA
 *
 * Un slot de UNA tab (PanelFrame) no se remonta al cambiar de panel: el
 * `<header>` y su provider son el mismo elemento en el mismo lugar del árbol,
 * así que React reusa el estado. Si `initialTitle` cambia, es que el host
 * cambió de panel y el header tiene que arrancar de cero — título del panel
 * nuevo y SIN las acciones del anterior (el panel que entra las registra al
 * montarse). Sin esta re-sincronización el header se quedaba con el título y
 * los botones del primer panel que se abrió, y parecía que el panel nuevo no
 * había cargado (el contenido sí cambiaba).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode
} from 'react'
import { setTabHeader } from '@features/tabs/tabHeaders'

interface PanelHeaderValue {
  title: string
  setTitle: (title: string) => void
  /** Render de las acciones del header (null = sin acciones). */
  actions: (() => ReactNode) | null
  setActions: (render: (() => ReactNode) | null) => void
}

const PanelHeaderContext = createContext<PanelHeaderValue | null>(null)

export function PanelTitleProvider({
  initialTitle,
  children
}: {
  initialTitle: string
  children: ReactNode
}): JSX.Element {
  const [title, setTitleState] = useState(initialTitle)
  const [actions, setActionsState] = useState<(() => ReactNode) | null>(null)
  /** Último título que MANDÓ el host (ver el bloque de arriba). */
  const [hostTitle, setHostTitle] = useState(initialTitle)

  if (initialTitle !== hostTitle) {
    // Patrón "ajustar estado cuando cambia una prop": se re-renderiza en el
    // acto con el estado nuevo, antes de pintar los hijos.
    setHostTitle(initialTitle)
    setTitleState(initialTitle)
    setActionsState(null)
  }

  const setTitle = useCallback((next: string): void => {
    setTitleState(next)
  }, [])

  const setActions = useCallback((render: (() => ReactNode) | null): void => {
    setActionsState(() => render)
  }, [])

  const value = useMemo(
    () => ({ title, setTitle, actions, setActions }),
    [title, actions, setTitle, setActions]
  )

  return <PanelHeaderContext.Provider value={value}>{children}</PanelHeaderContext.Provider>
}

/** Para que un panel cambie el título/acciones de su header. */
export function usePanelTitle(): PanelHeaderValue {
  const context = useContext(PanelHeaderContext)
  if (!context) {
    throw new Error('usePanelTitle debe usarse dentro de <PanelTitleProvider>')
  }
  return context
}

/**
 * Provider automático de header para contenido de panel (tabs).
 *
 * Un panel puede renderizar en dos modos: como ÚNICA tab de un slot (adentro
 * del PanelFrame, que ya provee el contexto con su header drageable) o como
 * una tab MÁS de un strip multi-tab (sin PanelFrame → sin provider). Si ya
 * hay un provider arriba (PanelFrame) se respeta tal cual; si no, se crea uno
 * local con el título inicial para que usePanelTitle() no truene (p. ej. el
 * Explorer arrastrado a un slot con tabs). El título/acciones que setee el
 * panel quedan en este contexto local — cuando el panel tiene header
 * (PanelFrame) van al header real.
 *
 * Con `publishKey` (`stripId:tabId`), el header local además se PUBLICA en
 * el registro de tabs (`features/tabs/tabHeaders`): el botón ⋯ del strip
 * muestra esas acciones en el menú contextual global (las que antes se
 * perdían al apilar tabs).
 */
export function PanelTitleAutoProvider({
  initialTitle,
  publishKey,
  children
}: {
  initialTitle: string
  /** Clave `stripId:tabId` para publicar el header (solo sin provider padre). */
  publishKey?: string
  children: ReactNode
}): JSX.Element {
  const hasParent = useContext(PanelHeaderContext) !== null
  if (hasParent) return <>{children}</>
  return (
    <PanelTitleProvider initialTitle={initialTitle}>
      {publishKey ? <TabHeaderPublisher tabKey={publishKey} /> : null}
      {children}
    </PanelTitleProvider>
  )
}

/**
 * Puente header → strip: publica título + acciones de ESTA tab en el
 * registro global y lo retira al desmontar. El TabStrip lo lee para el ⋯.
 */
function TabHeaderPublisher({ tabKey }: { tabKey: string }): null {
  const { title, actions } = usePanelTitle()

  useEffect(() => {
    setTabHeader(tabKey, actions ? { title, actions } : null)
    return () => setTabHeader(tabKey, null)
  }, [tabKey, title, actions])

  return null
}

/** Para leer el título (fallback al del registro si no hay provider). */
export function usePanelTitleValue(): string | null {
  const context = useContext(PanelHeaderContext)
  return context?.title ?? null
}

/** Versión tolerante: null si el panel no está dentro de un PanelFrame. */
export function usePanelTitleOptional(): PanelHeaderValue | null {
  return useContext(PanelHeaderContext)
}
