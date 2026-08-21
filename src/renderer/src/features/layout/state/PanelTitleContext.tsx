/**
 * Header dinámico del panel — título + acciones.
 *
 * Cualquier panel puede cambiar el título de su header con
 * `usePanelTitle().setTitle(...)` (ej. el Explorer muestra el nombre de la
 * carpeta abierta) y montar botones de acción con `setActions(render)` que
 * se dibujan a la derecha del título (ej. los botones del Explorer viven en
 * el propio header, no en una barra aparte). PanelFrame provee el contexto
 * con el título inicial del registro.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type JSX,
  type ReactNode
} from 'react'

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

/** Para leer el título (fallback al del registro si no hay provider). */
export function usePanelTitleValue(): string | null {
  const context = useContext(PanelHeaderContext)
  return context?.title ?? null
}
