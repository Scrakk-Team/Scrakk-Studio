/**
 * CursorPosition — indicador Ln / Col del editor en la statusbar.
 *
 * Suscrito al bus de cursor (features/editor/cursorBus.ts). Cuando el
 * engine de Innerta del editor activo emite eventos de cursor, el indicador
 * se actualiza solo. Si no hay NINGÚN archivo abierto (solo Bienvenida /
 * paneles), el indicador no se muestra: no hay editor del cual reportar.
 *
 * Coords: el bus entrega 0-based; aquí se suma 1 para humanos.
 */

import { useEffect, useState, type JSX } from 'react'
import { subscribeToEditorCursor } from '@features/editor/cursorBus'
import { getEditorFiles, subscribeToEditorFiles } from '@features/editor/editorBus'
import styles from './CursorPosition.module.css'

export function CursorPosition(): JSX.Element | null {
  const [cursor, setCursor] = useState<{ line: number; col: number } | null>(null)
  // Sin archivos abiertos no hay editor: ocultar el contador (no "Ln —, Col —").
  const [hasFiles, setHasFiles] = useState(() => getEditorFiles().openFiles.length > 0)

  useEffect(() => {
    return subscribeToEditorCursor(setCursor)
  }, [])

  useEffect(() => {
    return subscribeToEditorFiles((state) => setHasFiles(state.openFiles.length > 0))
  }, [])

  if (!hasFiles) return null

  const hasValue = cursor !== null
  return (
    <span
      className={styles.indicator}
      data-empty={hasValue ? 'false' : 'true'}
      aria-label="Posición del cursor en el editor"
      title={hasValue ? 'Posición del cursor' : 'Sin editor activo'}
    >
      <span className={styles.label}>Ln</span>
      <span className={styles.value}>{hasValue ? cursor.line + 1 : '—'}</span>
      <span className={styles.sep}>,</span>
      <span className={styles.label}>Col</span>
      <span className={styles.value}>{hasValue ? cursor.col + 1 : '—'}</span>
    </span>
  )
}
