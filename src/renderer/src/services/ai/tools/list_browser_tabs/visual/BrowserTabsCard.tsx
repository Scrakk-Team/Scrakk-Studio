// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * BrowserTabsCard — custom display for list_browser_tabs tool.
 * Simple info line pointing to the browser panel.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'

interface BrowserTabsCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function BrowserTabsCard({ status }: BrowserTabsCardProps): JSX.Element | null {
  // While loading: simple shimmer text.
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Listing tabs…" />
  }
  return <span>Listed browser tabs</span>
}
