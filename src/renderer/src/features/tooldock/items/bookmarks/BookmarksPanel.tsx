// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Bookmarks — panel del ToolDock.
 *
 * Lista los marcadores de TODOS los archivos (grupo por archivo, líneas
 * ordenadas). Click → abre el archivo en el editor; X → quita el bookmark.
 * La store (@services/bookmarks) es la fuente de verdad; el engine recibe
 * la lista y dibuja el proicon en el gutter.
 */

import { useEffect, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { IconButton } from '@ui'
import { openFileInEditor } from '@features/editor'
import {
  getAllBookmarks,
  toggleBookmark,
  subscribeToBookmarks
} from '@services/bookmarks'
import type { ToolDockPanelProps } from '../../types'
import styles from './BookmarksPanel.module.css'

function baseName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}

export default function BookmarksPanel({ hostId }: ToolDockPanelProps): JSX.Element {
  void hostId
  const [data, setData] = useState<Record<string, number[]>>(() => getAllBookmarks())

  useEffect(() => {
    const sync = (): void => setData(getAllBookmarks())
    sync()
    return subscribeToBookmarks(sync)
  }, [])

  const paths = Object.keys(data).sort((a, b) => a.localeCompare(b))

  if (paths.length === 0) {
    return (
      <div className={styles.empty}>
        Sin marcadores. Click derecho sobre el editor → “Añadir marcador”.
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {paths.map((path) => (
        <div key={path} className={styles.file}>
          <div className={styles.fileRow}>
            <ProductIcon id="file" size={12} />
            <span className={styles.fileName}>{baseName(path)}</span>
          </div>
          <div className={styles.lines}>
            {data[path].map((line) => (
              <div key={line} className={styles.line}>
                <button
                  type="button"
                  className={styles.lineBtn}
                  onClick={() => openFileInEditor(path, baseName(path))}
                  title={path}
                >
                  <ProductIcon id="bookmark" size={11} />
                  <span className={styles.lineNumber}>:{line + 1}</span>
                </button>
                <IconButton
                  size="sm"
                  shape="rounded"
                  label={`Quitar marcador de ${baseName(path)}:${line + 1}`}
                  onClick={() => toggleBookmark(path, line)}
                >
                  <ProductIcon id="close" size={11} />
                </IconButton>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
