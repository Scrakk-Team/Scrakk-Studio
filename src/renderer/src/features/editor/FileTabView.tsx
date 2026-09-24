// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useRef, type JSX } from 'react'
import { getFileSession } from './fileSession'

interface FileTabViewProps {
  /** Ruta del archivo que muestra la tab. */
  filePath: string
  /** Panel (strip) donde vive: define el motor compartido de ese panel. */
  stripId?: string
}

/**
 * Contenido de una tab de archivo. La sesión por path vive en el motor
 * compartido de su panel: al montar attach() la activa (crea el motor la 1ª
 * vez), al desmontar detach() no tira nada — el estado (texto, undo, cursor,
 * scroll) queda en la sesión, así mover la tab entre slots lo conserva.
 */
export function FileTabView({ filePath, stripId }: FileTabViewProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const session = getFileSession(filePath)
    session.attach(host, stripId ?? 'center')
    return () => {
      session.detach(host)
    }
  }, [filePath, stripId])

  return (
    <div
      ref={hostRef}
      className="file-tab-view-host"
      style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', position: 'relative' }}
    />
  )
}
