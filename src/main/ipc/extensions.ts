// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

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
  type InstallVsixRequest,
  type InstallVsixResponse,
  type PickVsixResponse,
  type UninstallRequest,
  type UninstallResponse,
  type PickSefResponse,
  type DynamicTokenizeRequest,
  type DynamicTokenizeResult,
  type TokenizeRequest,
  type TokenizeResult,
  type ExtensionSource,
  EXTENSION_ID_RE
} from '@shared/extensions'
import { convertVsix } from '@shared/compatibility'
import { tokenizeText } from '../extensions/tokenize'
import { treeSitterManager } from '../extensions/treeSitter/manager'
import { resolveLangsDir } from '../langs'

import { t } from '@shared/i18n'
import { confirmExtensionInstall } from '../extensions/consent'
import { verifySefFiles } from '../extensions/signature'
import { publisherStatus, rememberPublisher, forgetPublisher } from '../extensions/publisherTrust'
import { atomicInstall, cleanupStaleInstalls } from '../extensions/atomicInstall'
import { shutdownExtensionHost } from './extension-host'

let staleInstallCleanupDone = false

async function extensionsRoot(): Promise<string> {
  const dir = path.join(app.getPath('userData'), 'extensions')
  await fs.mkdir(dir, { recursive: true })
  // Restos de un crash/EPERM de una sesión anterior (`.staging-*`/`.backup-*`).
  if (!staleInstallCleanupDone) {
    staleInstallCleanupDone = true
    await cleanupStaleInstalls(dir)
  }
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

/** Límites anti zip-bomb de un `.sef` (un `.vsix` ya los tenía). */
const MAX_SEF_DOWNLOAD_BYTES = 100 * 1024 * 1024
const MAX_SEF_EXTRACTED_BYTES = 256 * 1024 * 1024
const MAX_SEF_FILES = 20_000

/** Lee el zip, ubica el manifest.json y aísla los archivos de la extensión. */
function parseSef(buffer: Uint8Array): ParsedSef {
  if (buffer.byteLength > MAX_SEF_DOWNLOAD_BYTES) {
    throw new Error(t('main.el.archivo.es.demasiado.grande'))
  }
  const entries = unzipSync(buffer, {
    filter: (file) => file.originalSize <= MAX_SEF_EXTRACTED_BYTES
  })
  const keys = Object.keys(entries)
  if (keys.length > MAX_SEF_FILES) throw new Error('El .sef tiene demasiados archivos')
  const total = keys.reduce((sum, key) => sum + (entries[key]?.byteLength ?? 0), 0)
  if (total > MAX_SEF_EXTRACTED_BYTES) throw new Error('El .sef descomprimido es demasiado grande')

  const manifestPath = keys.find((key) => key.endsWith('manifest.json'))
  if (!manifestPath) throw new Error(t('main.el.sef.no.contiene.manifest'))

  const root = path.posix.dirname(manifestPath)
  // `../manifest.json` haría que `relative` escape del paquete.
  if (root === '..' || root.startsWith('../') || path.posix.isAbsolute(root)) {
    throw new Error('El manifest del .sef está fuera del paquete')
  }
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
  if (files.size === 0) throw new Error(t('main.el.sef.esta.vacio'))

  return { manifest, id, files }
}

function manifestInfo(
  dir: string,
  manifest: Record<string, unknown>,
  extra?: { source?: ExtensionSource; coverage?: number; signed?: boolean; publisherKeyId?: string }
): InstalledExtensionInfo {
  return {
    id: String(manifest.id),
    name: String(manifest.name ?? manifest.id),
    version: String(manifest.version ?? '0.0.0'),
    author: typeof manifest.author === 'string' ? manifest.author : undefined,
    dir,
    source: extra?.source ?? 'sef',
    coverage: extra?.coverage,
    signed: extra?.signed,
    publisherKeyId: extra?.publisherKeyId
  }
}

/** Versión del traductor — bump al mejorar conversiones; fuerza re-instalación. */
const COMPAT_TRANSLATOR_VERSION = 3

/** Lee el sidecar .source.json (procedencia del traductor) si existe. */
async function readSourceSidecar(dir: string): Promise<{ source?: ExtensionSource; coverage?: number; translator?: number }> {
  try {
    const raw = await fs.readFile(path.join(dir, '.source.json'), 'utf-8')
    const parsed = JSON.parse(raw) as { source?: ExtensionSource; coverage?: number; translator?: number }
    if (parsed.source === 'vscode' || parsed.source === 'zed' || parsed.source === 'sef') {
      return {
        source: parsed.source,
        coverage: typeof parsed.coverage === 'number' ? parsed.coverage : undefined,
        translator: typeof parsed.translator === 'number' ? parsed.translator : undefined
      }
    }
  } catch {
    // Sin sidecar: es un .sef nativo.
  }
  return { source: 'sef' }
}

/**
 * Instala un `.sef` ya en memoria (lo usan el IPC y la tienda).
 *
 * `expectedId` vincula el paquete al slug del catálogo: sin esto, una
 * extensión podía declarar el id de otra, borrarla y quedarse con su lugar (y
 * con su `.market.json`, que el auto-update mantiene apuntando al atacante).
 */
export async function installSefFromBuffer(
  buffer: Uint8Array,
  options: {
    expectedId?: string
    /** Consentimiento del usuario (diálogo); los tests lo omiten. */
    confirm?: (manifest: Record<string, unknown>) => Promise<boolean>
    /** El market/auto-update exige firma; la instalación local la tolera. */
    requireSignature?: boolean
    /** Sidecars que deben entrar en la misma unidad atómica (`.market.json`). */
    extraFiles?: Record<string, string | Uint8Array>
  } = {}
): Promise<InstallSefResponse> {
  try {
    const parsed = parseSef(buffer)

    // 1) Firma: si existe, TIENE que verificar. Si no existe y el origen la
    //    exige (market/auto-update), no se instala.
    const signature = verifySefFiles(Object.fromEntries(parsed.files))
    if (signature.signed && !signature.ok) {
      return { success: false, error: `Firma inválida: ${signature.reason ?? 'desconocida'}` }
    }
    if (!signature.signed && options.requireSignature) {
      return {
        success: false,
        error: 'El paquete no está firmado. El market exige firma Ed25519 para instalar/actualizar.'
      }
    }
    let publisherTrust: 'match' | 'new' | undefined
    if (signature.signed && signature.ok && signature.keyId && signature.publicKey) {
      const status = await publisherStatus(parsed.id, signature.keyId, signature.publicKey)
      if (status === 'mismatch') {
        return {
          success: false,
          error:
            'La clave del publisher no coincide con la fijada para esta extensión. ' +
            'Desinstalala y volvé a instalarla si el autor rotó la clave.'
        }
      }
      publisherTrust = status
    }

    if (options.expectedId && parsed.id.toLowerCase() !== options.expectedId.toLowerCase()) {
      return {
        success: false,
        error: `El paquete declara id "${parsed.id}" y el catálogo esperaba "${options.expectedId}".`
      }
    }
    if (options.confirm && !(await options.confirm(parsed.manifest))) {
      return { success: false, error: t('main.ext.cancelada') }
    }

    // El host puede tener un `.node`/archivo abierto (Windows: EPERM). Se
    // apaga ANTES del swap; se relanza lazy en el próximo uso.
    await shutdownExtensionHost(parsed.id)
    const root = await extensionsRoot()
    const { targetDir } = await atomicInstall({
      root,
      id: parsed.id,
      files: parsed.files,
      extraFiles: options.extraFiles
    })

    // Solo se fija la clave después de escribir el paquete correctamente.
    if (signature.signed && signature.ok && publisherTrust === 'new' && signature.keyId && signature.publicKey) {
      await rememberPublisher(parsed.id, signature.keyId, signature.publicKey)
    }

    return {
      success: true,
      extension: manifestInfo(targetDir, parsed.manifest, {
        signed: signature.signed && signature.ok,
        publisherKeyId: signature.keyId
      })
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function registerExtensionsIpc(): void {
  ipcMain.handle(
    EXTENSIONS_IPC.installSef,
    async (_event, request: InstallSefRequest): Promise<InstallSefResponse> => {
      try {
        const buffer = await fs.readFile(request.path)
        return await installSefFromBuffer(new Uint8Array(buffer), {
          confirm: (manifest) => confirmExtensionInstall(manifest, 'sef')
        })
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle(
    EXTENSIONS_IPC.installVsix,
    async (_event, request: InstallVsixRequest): Promise<InstallVsixResponse> => {
      try {
        const buffer = await fs.readFile(request.path)
        const converted = convertVsix(new Uint8Array(buffer))
        const manifest = converted.manifest as Record<string, unknown>
        if (!(await confirmExtensionInstall(manifest, 'vsix'))) {
          return { success: false, error: t('main.ext.cancelada') }
        }

        await shutdownExtensionHost(converted.id)
        const root = await extensionsRoot()
        const { targetDir } = await atomicInstall({
          root,
          id: converted.id,
          files: converted.files,
          extraFiles: {
            '.source.json': JSON.stringify({
              source: 'vscode',
              coverage: converted.report.coverage,
              translator: COMPAT_TRANSLATOR_VERSION,
              // Para re-traducir sin el .vsix original guardado.
              originalPath: request.path
            })
          }
        })

        const contributes = manifest.contributes as Record<string, unknown> | undefined
        const countOf = (key: string): number =>
          Array.isArray(contributes?.[key]) ? (contributes?.[key] as unknown[]).length : 0
        return {
          success: true,
          extension: manifestInfo(targetDir, manifest, {
            source: 'vscode',
            coverage: converted.report.coverage
          }),
          compat: {
            coverage: converted.report.coverage,
            warning: converted.report.warning,
            translatedFileIcons: countOf('fileIcons'),
            translatedThemes: countOf('themes'),
            translatedProductIcons: countOf('productIcons'),
            requiresNode: converted.report.requiresNode
          }
        }
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
        await forgetPublisher(id)
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
        installed.push(manifestInfo(dir, manifest, await readSourceSidecar(dir)))
      } catch {
        // Carpeta sin manifest válido: se ignora.
      }
    }

    // Pack de lenguajes PREINSTALADO (`langs/`): se expone como una extensión
    // más. Su `manifest.json` declara `contributes.languages` con todas las
    // gramáticas, así que el renderer lo registra igual que un .sef instalado.
    const langsDir = resolveLangsDir()
    if (langsDir) {
      try {
        const manifest = JSON.parse(
          await fs.readFile(path.join(langsDir, 'manifest.json'), 'utf-8')
        ) as Record<string, unknown>
        if (typeof manifest.id === 'string') {
          installed.push({ ...manifestInfo(langsDir, manifest), source: 'sef' })
        }
      } catch {
        // Pack sin manifest válido: se ignora (los lenguajes del motor siguen).
      }
    }

    return installed
  })

  ipcMain.handle(EXTENSIONS_IPC.extensionsDir, async (): Promise<string> => extensionsRoot())

  ipcMain.handle(EXTENSIONS_IPC.pickSef, async (): Promise<PickSefResponse> => {
    const result = await dialog.showOpenDialog({
      title: t('main.instalar.extension'),
      properties: ['openFile'],
      filters: [{ name: t('main.scrakk.extension.sef'), extensions: ['sef'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false }
    }
    return { success: true, path: result.filePaths[0] }
  })

  ipcMain.handle(EXTENSIONS_IPC.pickVsix, async (): Promise<PickVsixResponse> => {
    const result = await dialog.showOpenDialog({
      title: t('main.instalar.extension.vs.code.vsix'),
      properties: ['openFile'],
      filters: [{ name: t('main.vs.code.extension'), extensions: ['vsix', 'zip'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false }
    }
    return { success: true, path: result.filePaths[0] }
  })

  /**
   * Re-traduce las extensiones VSIX viejas cuyo traductor cambió (misma
   * API que installVsix, pero recorre userData). Requiere el .vsix original
   * en su path guardado; si ya no existe, se salta (la versión materializada
   * sigue funcionando con el convertidor con el que nació).
   */
  ipcMain.handle(
    EXTENSIONS_IPC.retranslateVsix,
    async (): Promise<{ success: boolean; updated: string[]; skipped: string[] }> => {
      const root = await extensionsRoot()
      const entries = await fs.readdir(root, { withFileTypes: true })
      const updated: string[] = []
      const skipped: string[] = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const dir = path.join(root, entry.name)
        const meta = await readSourceSidecar(dir)
        if (meta.source !== 'vscode' || meta.translator === COMPAT_TRANSLATOR_VERSION) continue
        try {
          const sidecar = JSON.parse(
            await fs.readFile(path.join(dir, '.source.json'), 'utf-8')
          ) as { originalPath?: string }
          if (!sidecar.originalPath) {
            skipped.push(entry.name)
            continue
          }
          await fs.access(sidecar.originalPath)
          const buffer = await fs.readFile(sidecar.originalPath)
          const converted = convertVsix(new Uint8Array(buffer))
          if (converted.id !== entry.name) {
            skipped.push(entry.name)
            continue
          }
          await shutdownExtensionHost(entry.name)
          await atomicInstall({
            root,
            id: entry.name,
            files: converted.files,
            extraFiles: {
              '.source.json': JSON.stringify({
                source: 'vscode',
                coverage: converted.report.coverage,
                translator: COMPAT_TRANSLATOR_VERSION,
                originalPath: sidecar.originalPath
              })
            }
          })
          updated.push(entry.name)
        } catch {
          skipped.push(entry.name)
        }
      }
      return { success: true, updated, skipped }
    }
  )

  /**
   * Tokenizado con la gramática TextMate de una extensión de lenguaje.
   *
   * El renderer manda las rutas; el main verifica que estén dentro del
   * directorio de extensiones antes de leerlas (una ruta que viene de un
   * manifest es dato de terceros) y cachea gramática + registry.
   */
  ipcMain.handle(
    EXTENSIONS_IPC.tokenize,
    async (_event, request: TokenizeRequest): Promise<TokenizeResult> =>
      tokenizeText(request)
  )

  /**
   * Tokenizado con el parser tree-sitter del PAQUETE (proceso aparte).
   *
   * El manager verifica rutas y sha256 antes de mandar nada al worker, así que
   * aquí no hay nada que validar: si el pedido es inválido, el error sale del
   * manager y el renderer lo reporta como "este lenguaje no resalta".
   */
  ipcMain.handle(
    EXTENSIONS_IPC.tokenizeDynamic,
    async (_event, request: DynamicTokenizeRequest): Promise<DynamicTokenizeResult> => {
      try {
        return await treeSitterManager.tokenize(request)
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          scopeSets: [],
          tokens: [],
          applied: [],
          failed: []
        }
      }
    }
  )
}