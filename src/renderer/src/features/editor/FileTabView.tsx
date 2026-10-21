// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useRef, type JSX } from 'react'
import { getFileSession } from './fileSession'
import { useFileViewDispatcher } from './FileViewDispatcher'
import { ColorSwatchLayer } from './colorpicker'

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
 *
 * Es ALSO el punto de montaje del VISOR por formato: si el
 * `fileHandlerRegistry` resuelve un handler en modo `view` para esta ruta
 * (png, jpg, md, svg…) se monta su visor y el editor queda oculto detrás
 * (sigue montado: no se pierde undo ni scroll al alternar).
 */
export function FileTabView({ filePath, stripId }: FileTabViewProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const { viewing, node } = useFileViewDispatcher(filePath)

  // Sólo se adjunta la sesión de Innerta si el formato NO tiene visor
  // montado: en un PNG/escaneo no tiene sentido abrir un buffer de texto
  // (leería bytes como texto). El toggle del ojo lo dispara este mismo efecto.
  useEffect(() => {
    const host = hostRef.current
    if (!host || viewing) return
    const session = getFileSession(filePath)
    session.attach(host, stripId ?? 'center')
    return () => {
      session.detach(host)
    }
  }, [filePath, stripId, viewing])

  return (
    <>
      {/* El engine queda montado mientras hubo sesión; se oculta si manda el
          visor (`display` explícito: el inline pisa al atributo `hidden`). */}
      <div
        ref={hostRef}
        className="file-tab-view-host"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: viewing ? 'none' : 'flex',
          position: 'relative'
        }}
      >
        {/* La capa de color (los cuadraditos al lado de cada literal) la
            dibuja el frontend: el motor sólo publica dónde está cada color. */}
        {!viewing ? (
          <ColorSwatchLayer filePath={filePath} paneId={stripId ?? 'center'} />
        ) : null}
      </div>
      {viewing ? node : null}
    </>
  )
}
