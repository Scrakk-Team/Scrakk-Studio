// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ExecutionResult, ToolContext } from '../types'
export async function execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ExecutionResult> {
  try {
    const url = args.url as string
    window.dispatchEvent(new CustomEvent('fetch-web-content', { detail: { url } }))
    return { success: true, content: `Fetching web content from: ${url}. Check the browser panel for results.` }
  } catch (error) {
    return { success: false, content: `Error viewing web page: ${error}` }
  }
}
