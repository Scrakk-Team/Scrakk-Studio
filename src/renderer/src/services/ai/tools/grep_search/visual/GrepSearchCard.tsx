// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * GrepSearchCard — custom display for grep_search tool.
 * Shows the query and matched lines grouped by file.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface GrepSearchCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function GrepSearchCard({ args, status }: GrepSearchCardProps): JSX.Element | null {
  // While loading: simple shimmer text.
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Searching files…" />
  }
  const query = typeof args.query === 'string' ? args.query : ''
  if (!query) return null
  return <span>Searched "{query}" in files</span>
}
