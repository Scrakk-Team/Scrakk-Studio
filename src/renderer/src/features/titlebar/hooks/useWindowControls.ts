import { useEffect, useState } from 'react'

/**
 * Hook del módulo titlebar: expone las acciones de ventana (min/max/close)
 * y el estado de maximizado. En navegador puro (sin Electron) degrada a no-op.
 */
export function useWindowControls() {
  const api = window.api?.windowControls
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!api) return
    let active = true

    void api.isMaximized().then((value) => {
      if (active) setMaximized(value)
    })

    const unsubscribe = api.onMaximizedChange(setMaximized)
    return () => {
      active = false
      unsubscribe()
    }
  }, [api])

  return {
    minimize: () => api?.minimize(),
    toggleMaximize: () => api?.toggleMaximize(),
    close: () => api?.close(),
    maximized
  }
}
