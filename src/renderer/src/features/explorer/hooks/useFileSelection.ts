/**
 * Selección de archivos en el árbol — click simple, Ctrl/Cmd+click para
 * alternar, Shift+click para rango (sobre la lista plana visible).
 */

import { useCallback, useState } from 'react'

export function useFileSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastSelected, setLastSelected] = useState<string | null>(null)

  const select = useCallback(
    (path: string, flatPaths: string[], mode?: 'single' | 'multi' | 'range'): void => {
      if (mode === 'multi') {
        setSelected((prev) => {
          const next = new Set(prev)
          if (next.has(path)) next.delete(path)
          else next.add(path)
          return next
        })
        setLastSelected(path)
        return
      }

      if (mode === 'range' && lastSelected) {
        const a = flatPaths.indexOf(lastSelected)
        const b = flatPaths.indexOf(path)
        if (a !== -1 && b !== -1) {
          const [start, end] = a < b ? [a, b] : [b, a]
          setSelected(new Set(flatPaths.slice(start, end + 1)))
        }
        setLastSelected(path)
        return
      }

      setSelected(new Set([path]))
      setLastSelected(path)
    },
    [lastSelected]
  )

  const clear = useCallback((): void => {
    setSelected(new Set())
    setLastSelected(null)
  }, [])

  const setSelection = useCallback((paths: Iterable<string>): void => {
    const next = new Set(paths)
    setSelected(next)
    const last = [...next].pop() ?? null
    setLastSelected(last)
  }, [])

  return { selected, lastSelected, select, clear, setSelection }
}
