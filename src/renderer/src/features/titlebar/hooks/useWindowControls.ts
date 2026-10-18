// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useState } from 'react'
import { api } from '@services/api'

/**
 * Hook del módulo titlebar: expone las acciones de ventana (min/max/close)
 * y el estado de maximizado. En navegador puro (sin Electron) degrada a no-op.
 */
export function useWindowControls() {
  const winApi = api?.windowControls
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!api) return
    let active = true

    void winApi.isMaximized().then((value) => {
      if (active) setMaximized(value)
    })

    const unsubscribe = winApi.onMaximizedChange(setMaximized)
    return () => {
      active = false
      unsubscribe()
    }
  }, [api])

  return {
    minimize: () => winApi?.minimize(),
    toggleMaximize: () => winApi?.toggleMaximize(),
    close: () => winApi?.close(),
    maximized
  }
}
