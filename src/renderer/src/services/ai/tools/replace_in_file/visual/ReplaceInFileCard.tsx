// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * ReplaceInFileCard — custom display for replace_in_file tool.
 * Shows the text replacement with diff stats.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface ReplaceInFileCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
  originalContent?: string
  modifiedContent?: string
}

export function ReplaceInFileCard({ args, status }: ReplaceInFileCardProps): JSX.Element | null {
  // While loading: simple shimmer text.
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Editing file…" />
  }
  const path = typeof args.path === 'string' ? args.path : ''
  if (!path) return null
  return <span>Edited {path}</span>
}
