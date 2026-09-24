// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * web_search — busca en la web (main, sin CORS) y devuelve resultados.
 * Mismo contrato que el `web_search` de scrakk-cli: query + allowed_domains.
 */

import type { ExecutionResult, ToolContext } from '../types'

export async function execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ExecutionResult> {
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  if (!query) return { success: false, content: 'Missing search query' }
  const allowedDomains = Array.isArray(args.allowed_domains)
    ? (args.allowed_domains as unknown[]).filter((d): d is string => typeof d === 'string')
    : undefined

  if (!window.api.web) {
    return {
      success: false,
      content: 'La API web no está disponible en esta ventana (reinicia la app para cargar el preload nuevo).'
    }
  }

  const response = await window.api.web.search({ query, allowedDomains })
  if (!response.ok) return { success: false, content: `Web search failed: ${response.error}` }
  if (response.results.length === 0) {
    return { success: true, content: `No results for "${query}".` }
  }

  const lines = response.results.map((result, index) => {
    const snippet = result.snippet ? `\n   ${result.snippet}` : ''
    return `${index + 1}. ${result.title}\n   ${result.url}${snippet}`
  })
  return {
    success: true,
    content: `Results for "${query}":\n\n${lines.join('\n\n')}`
  }
}
