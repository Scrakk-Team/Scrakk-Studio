// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * OpenBrowserCard — custom display for open_browser tool.
 * Shows the URL opened in the default browser.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface OpenBrowserCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function OpenBrowserCard({ args, status }: OpenBrowserCardProps): JSX.Element | null {
  // While loading: simple shimmer text.
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Opening browser…" />
  }
  const url = typeof args.url === 'string' ? args.url : ''
  if (!url) return null
  return <span>Opened {url} in browser</span>
}
