/**
 * Sistema de shortcuts — hook de React.
 *
 * `useShortcut(combo, handler, options)` registra el atajo mientras el
 * componente está montado (se auto-desregistra al desmontar). El handler se
 * mantiene fresco vía ref, así no hace falta re-registrar al cambiar.
 */

import { useEffect, useRef } from 'react'
import { shortcuts } from './registry'
import type { ShortcutAction } from './types'

interface UseShortcutOptions {
  /** Descripción humana (registro/debug). */
  description?: string
  /** Evita el default del navegador (ej. Tab). */
  preventDefault?: boolean
  /** Prioridad ante conflictos. */
  priority?: number
  /** Id único (por defecto se genera del combo + contador). */
  id?: string
  /** Disparar también dentro de inputs (default: no para combos sin modificador). */
  allowInInput?: boolean
  /** Si false, el atajo queda desactivado (pero sigue registrado). */
  enabled?: boolean
}

let hookCounter = 0

export function useShortcut(
  combo: string,
  handler: (event: KeyboardEvent) => void,
  options: UseShortcutOptions = {}
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  const { description, preventDefault = true, priority, id, allowInInput, enabled = true } = options

  useEffect(() => {
    if (!enabled) return
    const action: ShortcutAction = {
      id: id ?? `use-shortcut:${combo}:${hookCounter++}`,
      combo,
      description,
      handler: (event) => handlerRef.current(event),
      preventDefault,
      priority,
      allowInInput
    }
    return shortcuts.register(action)
  }, [combo, description, preventDefault, priority, id, allowInInput, enabled])
}
