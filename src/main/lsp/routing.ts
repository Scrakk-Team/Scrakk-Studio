/**
 * LSP — routing de archivos a servers.
 *
 * Réplica de config.rs::resolve_servers / nearest_root:
 * un server atiende un archivo cuando su extensión matchea Y — si declara
 * root markers — se encuentra un marker caminando hacia arriba hasta el
 * workspace root. Multi-server: un .ts puede ser atendido por tsserver Y
 * eslint a la vez.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { LspServerConfig } from '@shared/lsp'

export interface ServerMatch {
  serverName: string
  languageId: string
}

/**
 * Camina desde el directorio del archivo hacia `stop` (inclusive) buscando
 * cualquiera de los markers. Devuelve el primer directorio que contenga uno.
 */
export async function nearestRoot(
  file: string,
  stop: string,
  markers: string[]
): Promise<string | null> {
  let dir = path.dirname(path.resolve(file))
  const stopAbs = path.resolve(stop)
  if (!dir.startsWith(stopAbs)) return null

  while (true) {
    for (const marker of markers) {
      try {
        await fs.access(path.join(dir, marker))
        return dir
      } catch {
        // marker no presente en este nivel
      }
    }
    if (dir === stopAbs) return null
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** Marker raíz declarado para un server (builtin o config explícita). */
export type RootMarkersResolver = (serverName: string) => string[] | undefined

/**
 * Resuelve TODOS los servers que deben atender `path`.
 * Orden determinista: alfabético por nombre (como el BTreeMap del CLI).
 */
export async function resolveServers(
  servers: Record<string, LspServerConfig>,
  workspaceRoot: string,
  filePath: string,
  rootMarkersFor: RootMarkersResolver
): Promise<ServerMatch[]> {
  const ext = path.extname(filePath).toLowerCase()
  if (!ext) return []

  const matched: ServerMatch[] = []
  for (const serverName of Object.keys(servers).sort()) {
    const config = servers[serverName]
    const languageId = config.extensions?.[ext]
    if (!languageId) continue

    const markers = rootMarkersFor(serverName)
    if (markers && markers.length > 0) {
      const root = await nearestRoot(filePath, workspaceRoot, markers)
      if (!root) continue
    }
    matched.push({ serverName, languageId })
  }
  return matched
}
