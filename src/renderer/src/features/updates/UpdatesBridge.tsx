// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, type JSX } from 'react'
import {
  applyRelease,
  applyUpdaterState,
  getUpdatesSnapshot,
  notifyAvailable,
  notifyDownloaded,
  refreshLatest,
  syncUpdaterState
} from '@services/updates'

/**
 * Puente de actualizaciones.
 *
 * - Una lectura de la última release al arrancar (no es polling).
 * - `onRelease`: versión nueva empujada por Realtime → aviso.
 * - `onUpdaterState`: descarga terminada → aviso para reiniciar.
 *
 * Vive en App.tsx una sola vez, igual que LspNotificationsBridge.
 */
export function UpdatesBridge(): JSX.Element | null {
  useEffect(() => {
    // Si el preload es viejo (app sin reiniciar tras tocar main/preload), no
    // están las suscripciones: no romper la UI, sólo no recibir el push.
    const updates = window.api?.updates
    if (!updates?.onRelease || !updates.onUpdaterState) return

    const offRelease = updates.onRelease((release) => {
      applyRelease(release, true)
      notifyAvailable(release)
    })
    const offState = updates.onUpdaterState((state) => {
      applyUpdaterState(state)
      if (state.status === 'downloaded') notifyDownloaded(state)
    })

    void (async () => {
      await syncUpdaterState()
      const release = await refreshLatest()
      if (release && getUpdatesSnapshot().updateAvailable) notifyAvailable(release)
    })()

    return () => {
      offRelease()
      offState()
    }
  }, [])

  return null
}
