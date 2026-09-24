// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * MultipleToolsCard — custom display for multiple_tools tool.
 * Lists the tools executed in sequence.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface MultipleToolsCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function MultipleToolsCard({ args, status }: MultipleToolsCardProps): JSX.Element | null {
  // While loading: simple shimmer text.
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Running tools…" />
  }
  const tools = Array.isArray(args.tools) ? args.tools : []
  if (tools.length === 0) return null
  return <span>Ran {tools.length} tools in sequence</span>
}
