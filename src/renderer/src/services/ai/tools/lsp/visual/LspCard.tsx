// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * LspCard — custom display for lsp tool.
 * Shows the LSP operation, file and position.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface LspCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function LspCard({ args, status }: LspCardProps): JSX.Element | null {
  // While loading: simple shimmer text.
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Querying LSP…" />
  }
  const operation = typeof args.operation === 'string' ? args.operation : ''
  const filePath = typeof args.file_path === 'string' ? args.file_path : ''
  if (!operation) return null
  return <span>LSP · {operation}{filePath ? ` · ${filePath}` : ''}</span>
}
