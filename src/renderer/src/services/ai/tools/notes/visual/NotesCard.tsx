// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * NotesCard — tarjeta del tool `notes`.
 * Una línea: la acción ("Listé notas", "Creé una nota"…) y su objetivo.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface NotesCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

const LABELS: Record<string, string> = {
  list: 'Listed notes',
  read: 'Read note',
  create: 'Created note',
  update: 'Updated note',
  delete: 'Deleted note'
}

function firstLine(text: string): string {
  const line = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0)
  return line ?? ''
}

export function NotesCard({ args, status }: NotesCardProps): JSX.Element | null {
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Notes…" />
  }

  const action = typeof args.action === 'string' ? args.action : ''
  const label = LABELS[action] ?? 'Notes'
  const rawTarget =
    typeof args.id === 'string' && args.id
      ? args.id
      : typeof args.content === 'string'
        ? firstLine(args.content)
        : ''

  return (
    <span className="notes-card">
      <span className="notes-card__label">{label}</span>
      {rawTarget ? <span className="notes-card__value">{rawTarget}</span> : null}
    </span>
  )
}
