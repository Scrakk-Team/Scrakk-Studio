// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * TerminalCard — simple text line for execute_command.
 * While running: shimmer. When done: "Ran $ {command}".
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface TerminalCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function TerminalCard({ args, status }: TerminalCardProps): JSX.Element | null {
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Running command…" />
  }
  const command = typeof args.command === 'string' ? args.command : ''
  if (!command) return null
  return <span>Ran $ {command}</span>
}
