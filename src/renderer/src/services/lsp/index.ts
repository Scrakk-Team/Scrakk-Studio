/**
 * Servicio LSP del renderer — API pública.
 *
 * El runtime corre en el proceso main (src/main/lsp); acá está la superficie
 * que consume el frontend: api.ts (requests tipados + sync) y
 * diagnosticsStore.ts (cache reactiva de diagnósticos).
 */

import { setLspWorkspace } from './api'

export * from './api'
export {
  getStoredDiagnostics,
  getAllStoredDiagnostics,
  getProblems,
  clearStoredDiagnostics,
  subscribeToDiagnostics,
  type StoredFileDiagnostics
} from './diagnosticsStore'
export { formatLspDiagnosticsBlock, lspAfterEdit } from './format'

/**
 * Sincroniza el workspace del LSP con el del Explorer: lee la raíz inicial
 * y sigue el evento 'workspace-changed'. Se llama UNA vez desde main.tsx.
 */
export function initLspWorkspaceSync(): void {
  if (!window.api?.lsp) return
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
