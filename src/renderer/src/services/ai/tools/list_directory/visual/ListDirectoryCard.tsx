// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * ListDirectoryCard — simple text line for list_directory tool.
 * While loading: shimmer. When done: "Listed {path}".
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface ListDirectoryCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function ListDirectoryCard({ args, status }: ListDirectoryCardProps): JSX.Element | null {
  // While loading: shared shimmer (same style across all tools).
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Listing directory…" />
  }
  const path = typeof args.path === 'string' && args.path !== '.' ? args.path : './'
  return <span>Listed {path}</span>
}
