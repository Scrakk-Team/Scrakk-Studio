// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ExecutionResult, ToolContext } from '../types'

export async function execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ExecutionResult> {
  try {
    let url = (args.url as string).trim()
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }
    window.dispatchEvent(new CustomEvent('open-url', { detail: { url } }))
    return { success: true, content: `Opened browser: ${url}` }
  } catch (error) {
    return { success: false, content: `Error opening browser: ${error}` }
  }
}
