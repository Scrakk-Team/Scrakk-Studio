// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * MoveFileCard — custom display for move_file tool.
 * Shows source → destination.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface MoveFileCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function MoveFileCard({ args, status }: MoveFileCardProps): JSX.Element | null {
  // While loading: simple shimmer text.
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Moving file…" />
  }
  const source = typeof args.source === 'string' ? args.source : ''
  const destination = typeof args.destination === 'string' ? args.destination : ''
  if (!source && !destination) return null
  return <span>Moved {source} → {destination}</span>
}
