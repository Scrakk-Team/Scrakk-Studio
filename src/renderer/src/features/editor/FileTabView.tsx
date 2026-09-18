import { useEffect, useRef, type JSX } from 'react'
import { getFileSession } from './fileSession'

interface FileTabViewProps {
  /** Ruta del archivo que muestra la tab. */
  filePath: string
}

/**
 * Contenido de una tab de archivo. La sesión por path es quien posee el
 * engine (multi-editor): al montar attach() (reanuda / crea), al desmontar
 * detach() pausa — el canvas y el módulo viven en la sesión, así mover la
 * tab entre slots conserva buffer, undo y scroll.
 */
export function FileTabView({ filePath }: FileTabViewProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const session = getFileSession(filePath)
    session.attach(host)
    return () => {
      session.detach(host)
    }
  }, [filePath])

  return (
    <div
      ref={hostRef}
      className="file-tab-view-host"
      style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', position: 'relative' }}
    />
  )
}
