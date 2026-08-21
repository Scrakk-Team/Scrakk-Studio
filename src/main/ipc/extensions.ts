/**
 * IPC del sistema de extensiones SEF — corre en el proceso main.
 *
 * Instala/desinstala extensiones del usuario en
 * `app.getPath('userData')/extensions/<id>/`. El `.sef` es un zip: se
 * descomprime con fflate (puro JS), se valida el manifest y se extrae.
 */

import { app, dialog, ipcMain } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { unzipSync } from 'fflate'
import {
  EXTENSIONS_IPC,
  type InstallSefRequest,
  type InstallSefResponse,
  type InstalledExtensionInfo,
  type UninstallRequest,
  type UninstallResponse,
  type PickSefResponse
} from '@shared/extensions'

const EXTENSION_ID_RE = /^[a-z0-9][a-z0-9._-]*$/i

async function extensionsRoot(): Promise<string> {
  const dir = path.join(app.getPath('userData'), 'extensions')
  await fs.mkdir(dir, { recursive: true })
  return dir
}

/** Valida el id para evitar path traversal en el directorio de instalación. */
function safeExtensionId(id: string): string | null {
  if (!EXTENSION_ID_RE.test(id)) return null
  const resolved = path.normalize(id)
  if (resolved.includes('..') || path.isAbsolute(resolved)) return null
  return resolved
}

interface ParsedSef {
  manifest: Record<string, unknown>
  id: string
  /** Archivos del zip (relativos a la raíz que contiene el manifest). */
  files: Map<string, Uint8Array>
}

/** Lee el zip, ubica el manifest.json y aísla los archivos de la extensión. */
function parseSef(buffer: Uint8Array): ParsedSef {
  const entries = unzipSync(buffer)
  const manifestPath = Object.keys(entries).find((key) => key.endsWith('manifest.json'))
  if (!manifestPath) throw new Error('El .sef no contiene manifest.json')

  const root = path.posix.dirname(manifestPath)
  const strip = root === '.' ? '' : root + '/'

  const manifestText = new TextDecoder().decode(entries[manifestPath])
  const manifest = JSON.parse(manifestText) as Record<string, unknown>
  const id = typeof manifest.id === 'string' ? manifest.id : ''
  if (!safeExtensionId(id)) {
    throw new Error(`Id de extensión inválido: "${id}"`)
  }

  const files = new Map<string, Uint8Array>()
  for (const [key, data] of Object.entries(entries)) {
    if (!key.startsWith(strip)) continue
    const relative = key.slice(strip.length)
    if (!relative) continue
    files.set(relative, data)
  }
  if (files.size === 0) throw new Error('El .sef está vacío')

  return { manifest, id, files }
}

function manifestInfo(dir: string, manifest: Record<string, unknown>): InstalledExtensionInfo {
  return {
    id: String(manifest.id),
    name: String(manifest.name ?? manifest.id),
    version: String(manifest.version ?? '0.0.0'),
    author: typeof manifest.author === 'string' ? manifest.author : undefined,
    dir
  }
}

export function registerExtensionsIpc(): void {
  ipcMain.handle(
    EXTENSIONS_IPC.installSef,
    async (_event, request: InstallSefRequest): Promise<InstallSefResponse> => {
      try {
        const buffer = await fs.readFile(request.path)
        const parsed = parseSef(new Uint8Array(buffer))

        const root = await extensionsRoot()
        const targetDir = path.join(root, parsed.id)
        await fs.rm(targetDir, { recursive: true, force: true })
        await fs.mkdir(targetDir, { recursive: true })

        for (const [relative, data] of parsed.files) {
          const target = path.join(targetDir, relative)
          const normalized = path.normalize(relative)
          if (normalized.includes('..') || path.isAbsolute(normalized)) continue
          await fs.mkdir(path.dirname(target), { recursive: true })
          await fs.writeFile(target, data)
        }

        return { success: true, extension: manifestInfo(targetDir, parsed.manifest) }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle(
    EXTENSIONS_IPC.uninstall,
    async (_event, request: UninstallRequest): Promise<UninstallResponse> => {
      const id = safeExtensionId(request.id)
      if (!id) return { success: false, error: `Id inválido: "${request.id}"` }
      try {
        await fs.rm(path.join(await extensionsRoot(), id), { recursive: true, force: true })
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle(EXTENSIONS_IPC.listInstalled, async (): Promise<InstalledExtensionInfo[]> => {
    const root = await extensionsRoot()
    const entries = await fs.readdir(root, { withFileTypes: true })
    const installed: InstalledExtensionInfo[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dir = path.join(root, entry.name)
      try {
        const manifest = JSON.parse(
          await fs.readFile(path.join(dir, 'manifest.json'), 'utf-8')
        ) as Record<string, unknown>
        if (typeof manifest.id !== 'string') continue
        installed.push(manifestInfo(dir, manifest))
      } catch {
        // Carpeta sin manifest válido: se ignora.
      }
    }
    return installed
  })

  ipcMain.handle(EXTENSIONS_IPC.extensionsDir, async (): Promise<string> => extensionsRoot())

  ipcMain.handle(EXTENSIONS_IPC.pickSef, async (): Promise<PickSefResponse> => {
    const result = await dialog.showOpenDialog({
      title: 'Instalar extensión',
      properties: ['openFile'],
      filters: [{ name: 'Scrakk Extension (SEF)', extensions: ['sef'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false }
    }
    return { success: true, path: result.filePaths[0] }
  })
}