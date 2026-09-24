// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * web_fetch — trae una URL como markdown (main, con protección SSRF).
 */

import type { ExecutionResult, ToolContext } from '../types'

export async function execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ExecutionResult> {
  const url = typeof args.url === 'string' ? args.url.trim() : ''
  if (!url) return { success: false, content: 'Missing URL' }

  if (!window.api.web) {
    return {
      success: false,
      content: 'La API web no está disponible en esta ventana (reinicia la app para cargar el preload nuevo).'
    }
  }

  const response = await window.api.web.fetch({ url })
  if (!response.ok) return { success: false, content: `Web fetch failed: ${response.error}` }

  const header = response.title ? `# ${response.title}\n\n` : ''
  const footer = response.truncated ? '\n\n[content truncated]' : ''
  return {
    success: true,
    content: `${header}${response.content}${footer}`,
    filePath: response.finalUrl
  }
}
