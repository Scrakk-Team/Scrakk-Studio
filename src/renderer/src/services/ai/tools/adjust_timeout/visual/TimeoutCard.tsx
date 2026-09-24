// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * TimeoutCard — custom display for adjust_timeout tool.
 * Shows the added seconds.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface TimeoutCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function TimeoutCard({ args, status }: TimeoutCardProps): JSX.Element | null {
  // While loading: simple shimmer text.
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Adjusting timeout…" />
  }
  const seconds = Number(args.additional_seconds ?? 0)
  if (!seconds) return null
  return <span>Timeout +{seconds}s</span>
}
