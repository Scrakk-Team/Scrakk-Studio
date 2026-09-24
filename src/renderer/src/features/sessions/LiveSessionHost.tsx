// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useRef, type JSX } from 'react'

/**
 * Sesión VIVA: posee un nodo (canvas) y un engine/módulo que NO debe morir
 * cuando la tab deja de estar visible o cambia de slot. attach(host) monta
 * el nodo en el host y reanuda el render; detach() lo pausa y lo desmonta;
 * dispose() destruye TODO (cerrar la tab).
 */
export interface LiveSession {
  attach(host: HTMLElement): void
  /**
   * Pausa la sesión. Recibe el host que se desmonta para que un cleanup
   * STALE (que corre después de un attach a OTRO host, p.ej. al mover la
   * tab de panel) no mate el estado del host actual.
   */
  detach(host?: HTMLElement): void
  dispose(): void
}

interface LiveSessionHostProps {
  session: LiveSession
}

/**
 * Host genérico de una sesión viva: crea un contenedor y le attacha la
 * sesión. Al desmontar (tab inactiva, tab movida de slot) SOLO la detacha:
 * el estado (buffer, undo, PTY, módulo WASM) sigue vivo en la sesión.
 */
export function LiveSessionHost({ session }: LiveSessionHostProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    session.attach(host)
    return () => {
      session.detach(host)
    }
  }, [session])

  return (
    <div
      ref={hostRef}
      className="live-session-host"
      style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', position: 'relative' }}
    />
  )
}
