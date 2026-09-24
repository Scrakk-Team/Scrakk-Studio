// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * NavigateWebCard — custom display for navigate_web tool.
 * Shows the action performed on a browser tab.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface NavigateWebCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function NavigateWebCard({ args, status }: NavigateWebCardProps): JSX.Element | null {
  // While loading: simple shimmer text.
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Navigating…" />
  }
  const action = typeof args.action === 'string' ? args.action : ''
  const target = typeof args.target === 'string' ? args.target : ''
  if (!action) return null
  return <span>Navigated: {action}{target ? ` (${target})` : ''}</span>
}
