// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * WriteFileCard — custom display for write_file tool.
 * Shows file path and content stats (lines added/removed).
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface WriteFileCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
  originalContent?: string
  modifiedContent?: string
}

export function WriteFileCard({ args, status }: WriteFileCardProps): JSX.Element | null {
  // While loading: simple shimmer text.
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Writing file…" />
  }
  const path = typeof args.path === 'string' ? args.path : ''
  if (!path) return null
  return <span>Wrote {path}</span>
}
