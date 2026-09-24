// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * LSP — formateo de diagnósticos para el agente.
 *
 * Réplica del formato de manager.rs/build_summary_from_collected:
 *   <lsp-diagnostics>
 *   ruta:
 *     error[L12]: mensaje
 *     warn[L3]: mensaje
 *   </lsp-diagnostics>
 * Con escape de los tags de cierre (paridad con el CLI).
 */

import type { FileDiagnostics } from '@shared/lsp'

function escapeMessage(message: string): string {
  return message
    .replaceAll('</lsp-diagnostics>', '&lt;/lsp-diagnostics&gt;')
    .replaceAll('</system-reminder>', '&lt;/system-reminder&gt;')
}

/** Bloque <lsp-diagnostics> o null si no hay nada que reportar. */
export function formatLspDiagnosticsBlock(files: FileDiagnostics[]): string | null {
  const lines: string[] = []
  let fileCount = 0

  for (const file of files) {
    if (file.diagnostics.length === 0) continue
    lines.push(`${file.path}:`)
    fileCount++
    for (const diagnostic of file.diagnostics) {
      const label = diagnostic.severity === 1 ? 'error' : 'warn'
      lines.push(`  ${label}[L${diagnostic.range.start.line + 1}]: ${escapeMessage(diagnostic.message)}`)
    }
  }

  if (lines.length === 0) return null
  return `<lsp-diagnostics>\n${lines.join('\n')}\n</lsp-diagnostics>`
}

/**
 * Gancho post-edición (patrón reminders/lsp_diagnostics.rs del CLI):
 * sincroniza el archivo editado, espera a que los servers reporten y
 * devuelve el bloque formateado — o null si todo está limpio.
 */
export async function lspAfterEdit(path: string, content: string): Promise<string | null> {
  const { lspNotifyFileChanged, lspDrainDiagnostics } = await import('./api')
  await lspNotifyFileChanged(path, content)
  const files = await lspDrainDiagnostics()
  return formatLspDiagnosticsBlock(files)
}
