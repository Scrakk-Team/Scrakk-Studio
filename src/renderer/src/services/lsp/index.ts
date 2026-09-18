/**
 * Servicio LSP del renderer — API pública.
 *
 * El runtime corre en el proceso main (src/main/lsp); acá está la superficie
 * que consume el frontend: api.ts (requests tipados + sync) y
 * diagnosticsStore.ts (cache reactiva de diagnósticos).
 */

import { setLspWorkspace } from './api'
import { initDisabledServers } from './disabledServers'

export * from './api'
export {
  getStoredDiagnostics,
  getAllStoredDiagnostics,
  getProblems,
  clearStoredDiagnostics,
  subscribeToDiagnostics,
  countProblems,
  severityOf,
  applyExtensionDiagnostics,
  dropExtensionDiagnostics,
  type StoredFileDiagnostics,
  type DiagnosticsSourceKind,
  type ProblemCounts
} from './diagnosticsStore'
export { formatLspDiagnosticsBlock, lspAfterEdit } from './format'
export {
  DIAGNOSTICS_SOURCE_PREFIX,
  diagnosticHoverText,
  diagnosticsAt,
  diagnosticsToDecorations,
  initDiagnosticsDecorations,
  refreshDiagnosticsDecorations
} from './decorations'
export { hoverContentsToText, markedStringToText } from './hover'
export { initLspFileSync, notifyLspDocumentSaved } from './fileSync'
export {
  getDisabledServers,
  initDisabledServers,
  isServerDisabled,
  setServerDisabled,
  subscribeToDisabledServers
} from './disabledServers'

/**
 * Sincroniza el workspace del LSP con el del Explorer: lee la raíz inicial
 * y sigue el evento 'workspace-changed'. Se llama UNA vez desde main.tsx.
 */
export function initLspWorkspaceSync(): void {
  if (!window.api?.lsp) return
  // Los servers que el usuario apagó (Ajustes → Servidores) se aplican ANTES
  // de cualquier archivo: si no, el server arrancaría y recién después se
  // apagaría (con sus diagnósticos ya publicados).
  initDisabledServers()
  const KEY = 'scrakk-studio:root-path'
  try {
    const initial = localStorage.getItem(KEY)
    if (initial) void setLspWorkspace(initial)
  } catch {
    // sin storage: solo eventos
  }
  window.addEventListener('workspace-changed', (event) => {
    const detail = (event as CustomEvent<{ path?: string }>).detail
    if (detail?.path) void setLspWorkspace(detail.path)
  })
}
export { aggregateServerState, type AggregateLspState } from './aggregate'
export { lspRestartServer, lspInstallServer } from './api'
export { decodeSemanticTokens, type DecodedSemanticToken } from './semanticTokens'
