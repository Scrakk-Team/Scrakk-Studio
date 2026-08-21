/**
 * LSP — configuración de servers.
 *
 * Réplica de config.rs del CLI: parse tolerante con aliases camelCase,
 * defaults idénticos, fusión usuario → proyecto → builtins (builtins solo
 * llenan huecos, jamás pisan config explícita).
 */

import type { LspServerConfig } from '@shared/lsp'
import {
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  DEFAULT_STARTUP_TIMEOUT_MS,
  parseLspServerConfig
} from '@shared/lsp'
import { loadLayered } from '../scrakkFolder'

export const LSP_CONFIG_FILE = 'lsp.json'

export { parseLspServerConfig }

export interface LoadedLspServers {
  configs: Record<string, LspServerConfig>
  sources: Record<string, 'user' | 'project'>
}

/**
 * Carga user (~/.scrakk/lsp.json) + proyecto (<root>/.scrakk/lsp.json).
 * El proyecto gana sobre el usuario por nombre de server.
 */
export async function loadConfiguredServers(projectRoot: string): Promise<LoadedLspServers> {
  const result = await loadLayered<LspServerConfig>(
    LSP_CONFIG_FILE,
    projectRoot,
    (raw, key) => parseLspServerConfig(raw, key)
  )
  return { configs: result.merged, sources: result.sources }
}

/** Timeouts con defaults del CLI. */
export function effectiveStartupTimeout(config: LspServerConfig): number {
  return config.startupTimeout ?? DEFAULT_STARTUP_TIMEOUT_MS
}

export function effectiveShutdownTimeout(config: LspServerConfig): number {
  return config.shutdownTimeout ?? DEFAULT_SHUTDOWN_TIMEOUT_MS
}
