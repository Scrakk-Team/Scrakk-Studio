// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * DeleteFileCard — custom display for delete_file tool.
 * Shows the deleted path and the operation result.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface DeleteFileCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function DeleteFileCard({ args, status }: DeleteFileCardProps): JSX.Element | null {
  // While loading: simple shimmer text.
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Deleting file…" />
  }
  const path = typeof args.path === 'string' ? args.path : ''
  if (!path) return null
  return <span>Deleted {path}</span>
}
