// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useState, type JSX } from 'react'
import type { FileHandlerViewProps } from '../../types'
import styles from '../../viewers.module.css'
import { api } from '@services/api'

/**
 * Visor de imágenes: el archivo se lee por IPC en base64 (la CSP del renderer
 * permite `data:` pero no `file:`) y se pinta como `<img>`.
 */
export default function ImageViewer({ path }: FileHandlerViewProps): JSX.Element {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setSrc(null)
    setError(null)
    void (async () => {
      // El puente lo agrega el PRELOAD: si la ventana es vieja, no existe.
      const readBinary = api?.fs?.readBinary
      if (typeof readBinary !== 'function') {
        setError('Falta el puente fs.readBinary: hay que reiniciar la app (no alcanza con recargar).')
        return
      }
      const res = await readBinary(path)
      if (!alive) return
      if (!res.success || !res.base64) {
        setError(res.error ?? 'No se pudo leer la imagen.')
        return
      }
      setSrc(`data:${res.mime ?? 'application/octet-stream'};base64,${res.base64}`)
    })()
    return () => {
      alive = false
    }
  }, [path])

  return (
    <div className={styles.view}>
      {error ? <span className={styles.error}>{error}</span> : null}
      {src ? (
        <div className={styles.center}>
          <img src={src} alt="" />
        </div>
      ) : null}
    </div>
  )
}
