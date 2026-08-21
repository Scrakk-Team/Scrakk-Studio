/**
 * Resolución de un manifest → contribuciones registradas.
 *
 * GENÉRICO: no conoce tipos específicos. Itera `manifest.contributes`,
 * pregunta al ExtensionTypeRegistry por el handler de cada key y delega
 * (parse → register → track para desinstalación). Es la MISMA lógica para
 * builtin y para extensiones del usuario: lo único que cambia es el resolver
 * y el acceso a archivos del paquete.
 */

import { ExtensionRegistry } from '../registry'
import { ensureTypesRegistered, ExtensionTypeRegistry } from '../types'
import { getExtensionApi } from '../extensionApi'
import type {
  ExtensionManifest,
  ComponentResolver,
  RegisteredExtension
} from '../manifest'

export async function registerManifest(
  manifest: ExtensionManifest,
  resolver: ComponentResolver,
  isBuiltin: boolean,
  /** Raíz del paquete instalado (solo .sef; vacío para builtin). */
  packageDir = ''
): Promise<void> {
  ensureTypesRegistered()

  const extId = manifest.id

  const meta: RegisteredExtension = {
    id: extId,
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
    description: manifest.description,
    isBuiltin
  }
  ExtensionRegistry.registerExtension(meta)

  const hasModule = resolver.hasModule ?? (() => true)

  /**
   * Lectura de archivos del paquete (temas, data…). Solo las .sef tienen
   * archivos en disco: las builtin resuelven su data embebida en el handler.
   */
  const readFile = async (path: string): Promise<string | null> => {
    if (isBuiltin || !packageDir) return null
    if (!window.api?.fs) return null
    const res = await window.api.fs.readFile(`${packageDir}/${path}`)
    return res.success && typeof res.content === 'string' ? res.content : null
  }

  const contributes = manifest.contributes ?? {}

  for (const [kind, raw] of Object.entries(contributes)) {
    const handler = ExtensionTypeRegistry.getHandler(kind)
    if (!handler) {
      console.warn(`[extensions] "${extId}": tipo de contribución desconocido "${kind}"`)
      continue
    }

    let parsed
    try {
      parsed = handler.parse(raw, { hasModule })
    } catch (error) {
      console.warn(`[extensions] "${extId}" falló parseando ${kind}:`, error)
      continue
    }
    if (!parsed) continue

    for (const contribution of parsed) {
      try {
        const registered = await handler.register(contribution, {
          extensionId: extId,
          isBuiltin,
          resolver,
          readFile,
          api: getExtensionApi()
        })
        if (registered !== null && registered !== undefined) {
          ExtensionTypeRegistry.track(extId, kind, registered)
        }
      } catch (error) {
        console.warn(`[extensions] "${extId}" falló registrando ${kind}:`, error)
      }
    }
  }
}
