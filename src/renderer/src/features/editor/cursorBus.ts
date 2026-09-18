/**
 * Cursor del editor — bus singleton.
 *
 * El bridge de InnertaEngine empuja la posición del cursor del editor
 * activo cada vez que cambia. La statusbar (y quien quiera) se suscribe
 * y muestra `Ln X, Col Y` en vivo.
 *
 * El estado inicial es `null` (sin editor activo o sin evento aún):
 * la UI muestra el placeholder "Ln —, Col —". Cuando el otro repo
 * de InnertaEngine emita eventos de cursor, este bus se llena solo.
 *
 * Coords: 0-based, igual que las devuelve `_InnertaHitTest` y como las
 * espera el LSP. La UI le suma 1 al renderizar (1-based para humanos).
 */

export interface EditorCursor {
  /** Línea 0-based. */
  line: number
  /** Columna 0-based (en code points, no en grapheme clusters). */
  col: number
}

type CursorListener = (cursor: EditorCursor | null) => void

let current: EditorCursor | null = null
const listeners = new Set<CursorListener>()

/** Snapshot inmutable. */
export function getEditorCursor(): EditorCursor | null {
  return current ? { line: current.line, col: current.col } : null
}

/** Empuja una nueva posición. Llamar desde el bridge de InnertaEngine. */
export function setEditorCursor(cursor: EditorCursor | null): void {
  if (cursor !== null) {
    if (cursor.line < 0 || cursor.col < 0) {
      cursor = null
    } else if (
      current !== null &&
      current.line === cursor.line &&
      current.col === cursor.col
    ) {
      // No-op: misma posición, evita re-renders innecesarios.
      return
    }
  } else if (current === null) {
    return
  }
  current = cursor
  for (const listener of listeners) {
    try {
      listener(cursor ? { line: cursor.line, col: cursor.col } : null)
    } catch {
      // Un suscriptor roto no debe tumbar a los demás.
    }
  }
}

/** Suscripción. Devuelve un unsubscribe. */
export function subscribeToEditorCursor(listener: CursorListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Para tests: limpia listeners y resetea el estado. */
export function _resetEditorCursorForTests(): void {
  current = null
  listeners.clear()
}
