/**
 * Wiring notificaciones ↔ LSP.
 *
 * Eventos de servers (crash, bloqueo por fallos persistentes, instalación)
 * disparan notificaciones REALES vía la API global — la misma que usarán
 * las extensiones. Se monta una vez en AppShell junto al resto de hosts.
 */

import { useEffect, type JSX } from 'react'
import { onLspServerEvent } from '@services/lsp'
import { notify } from '@services/notifications'
import { openSettingsModal } from '@features/settings'

const seenFailures = new Map<string, number>()

export function LspNotificationsBridge(): JSX.Element | null {
  useEffect(() => {
    return onLspServerEvent((event) => {
      // Recuperación → limpiar dedupe para que un FUTURO fallo avise de nuevo.
      if (event.state === 'ready') {
        for (const key of [...seenFailures.keys()]) {
          if (key.startsWith(`${event.serverName}:`)) seenFailures.delete(key)
        }
        return
      }
      if (event.state !== 'failed') return

      // Dedupe: el mismo server + mismo error = UNA sola notificación.
      const key = `${event.serverName}:${event.error ?? ''}`
      if (seenFailures.has(key)) return
      seenFailures.set(key, 1)

      notify({
        title: `Language Server: ${event.serverName}`,
        message: event.error ?? 'fallo desconocido',
        severity: 'error',
        corner: 'br',
        // Tiempo explícito: la raya inferior muestra cuánto queda antes de
        // cerrarse sola. Los botones siguen disponibles mientras esté.
        timeoutMs: 12000,
        actions: [
          { label: 'Ver servidores', run: () => openSettingsModal('servers') },
          {
            label: 'Reiniciar',
            run: () => void window.api.lsp.restartServer(event.serverName)
          }
        ]
      })
    })
  }, [])

  return null
}

/** Notifica el resultado de instalar un server (desde el modal). */
export function notifyInstallResult(
  serverName: string,
  result: { ok: boolean; error?: string }
): void {
  if (result.ok) {
    notify({
      title: `Servidor instalado: ${serverName}`,
      severity: 'success',
      corner: 'br',
      timeoutMs: 5000
    })
  } else {
    notify({
      title: `Instalación fallida: ${serverName}`,
      message: result.error,
      severity: 'error',
      corner: 'br',
      timeoutMs: 12000,
      actions: [{ label: 'Ver servidores', run: () => openSettingsModal('servers') }]
    })
  }
}
