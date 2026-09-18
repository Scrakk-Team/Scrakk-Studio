/**
 * Encodings — registro de handlers IPC.
 *
 * Mismo patrón que ipc/fs.ts. Canales definidos en @shared/encodings.
 * Los codecs dinámicos de extensiones se declaran acá pero su conversión
 * corre en el renderer (sandbox) — el main solo guarda metadatos.
 */

import { ipcMain } from 'electron'
import {
  ENCODINGS_IPC,
  type ListEncodingsResponse,
  type ReadEncodedRequest,
  type ReadEncodedResponse,
  type RegisterDynamicCodecsRequest,
  type RegisterDynamicCodecsResponse,
  type RemoveDynamicCodecsRequest,
  type WriteEncodedRequest,
  type WriteEncodedResponse
} from '@shared/encodings'
import { readFileEncoded, writeFileEncoded } from './service'
import { listEncodings, registerDynamic, removeDynamic, hasEncoding, getCodec } from './registry'
import { isBuiltinEncoding } from './detect'

export function registerEncodingsIpc(): void {
  ipcMain.handle(
    ENCODINGS_IPC.readEncoded,
    async (_event, request: unknown): Promise<ReadEncodedResponse> => {
      const req = request as ReadEncodedRequest
      if (!req?.path) return { success: false, error: 'Falta path' }
      try {
        const result = await readFileEncoded(req.path)
        if (result.success && result.detected) {
          // Anotación útil para el picker: si el encoding detectado es builtin
          // con BOM, ya viene anotado por detect().
          void result.detected
        }
        return result
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        return { success: false, error: msg }
      }
    }
  )

  ipcMain.handle(
    ENCODINGS_IPC.writeEncoded,
    async (_event, request: unknown): Promise<WriteEncodedResponse> => {
      const req = request as WriteEncodedRequest
      if (!req?.path || typeof req.text !== 'string' || !req.encoding) {
        return { success: false, error: 'Payload incompleto (path/text/encoding)' }
      }
      try {
        return await writeFileEncoded(req.path, req.text, {
          encoding: req.encoding,
          preserveBom: req.preserveBom,
          lineEnding: req.lineEnding
        })
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        return { success: false, error: msg }
      }
    }
  )

  ipcMain.handle(ENCODINGS_IPC.list, (): ListEncodingsResponse => {
    return { success: true, encodings: listEncodings() }
  })

  ipcMain.handle(
    ENCODINGS_IPC.registerDynamic,
    (_event, request: unknown): RegisterDynamicCodecsResponse => {
      const req = request as RegisterDynamicCodecsRequest
      if (!req?.extensionId || !Array.isArray(req.codecs)) {
        return { success: false, error: 'Payload incompleto' }
      }
      // Un codec dinámico no puede pisar un builtin.
      const filtered = req.codecs.filter((c) => c.id && !isBuiltinEncoding(c.id))
      const registeredIds = registerDynamic({ extensionId: req.extensionId, codecs: filtered })
      return { success: true, registeredIds }
    }
  )

  ipcMain.handle(
    ENCODINGS_IPC.removeDynamic,
    (_event, request: unknown): { success: boolean; removed?: string[] } => {
      const req = request as RemoveDynamicCodecsRequest
      if (!req?.extensionId) return { success: false }
      return { success: true, removed: removeDynamic(req.extensionId) }
    }
  )
}

/** Utilidad interna (tests/diagnóstico): ¿existe el codec con implementación? */
export function hasNativeCodec(id: string): boolean {
  return hasEncoding(id) && !!getCodec(id)
}
