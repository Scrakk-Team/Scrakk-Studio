// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Timeline — panel de línea de tiempo del ToolDock.
 *
 * Porte del TimelinePanel de Scrakk Code Editor: historial de acciones del
 * archivo activo (creado/abierto/modificado/guardado/cerrado) via
 * fileTimelineService. Registra la apertura del archivo al montarlo/cambiar;
 * sin eventos globales (el archivo activo llega por props).
 */

import { useEffect, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import {
  fileTimelineService,
  type TimelineAction,
  type TimelineEntry
} from '@services/fileTimeline'
import type { ToolDockPanelProps } from '../../types'
import styles from './TimelinePanel.module.css'

const ACTION_ICON: Record<TimelineAction, string> = {
  created: 'add',
  opened: 'folder-open',
  modified: 'pencil',
  saved: 'checkmark',
  closed: 'close'
}

function formatTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (seconds < 60) return 'Hace un momento'
  if (minutes < 60) return `Hace ${minutes} min`
  if (hours < 24) return `Hace ${hours} h`
  if (days < 7) return `Hace ${days} d`
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

export default function TimelinePanel({ currentFile }: ToolDockPanelProps): JSX.Element {
  const [entries, setEntries] = useState<TimelineEntry[]>([])

  useEffect(() => {
    if (!currentFile) {
      setEntries([])
      return
    }
    // Registrar la apertura (el servicio deduplica <1s).
    fileTimelineService.addEntry(currentFile.path, 'opened')
    setEntries(fileTimelineService.getForFile(currentFile.path))
    const unsub = fileTimelineService.subscribe((path) => {
      if (path === currentFile.path) {
        setEntries(fileTimelineService.getForFile(path))
      }
    })
    return () => {
      unsub()
    }
  }, [currentFile])

  if (!currentFile) {
    return <div className={styles.empty}>Abre un archivo para ver su línea de tiempo</div>
  }
  if (entries.length === 0) {
    return <div className={styles.empty}>Sin actividad registrada todavía</div>
  }
  return (
    <div className={styles.list}>
      {entries.map((entry) => (
        <div key={entry.id} className={styles.item}>
          <ProductIcon id={ACTION_ICON[entry.action] ?? 'clock'} size={14} />
          <span className={styles.action}>{entry.action}</span>
          {entry.detail ? <span className={styles.detail}>{entry.detail}</span> : null}
          <span className={styles.time}>{formatTime(entry.timestamp)}</span>
        </div>
      ))}
    </div>
  )
}
