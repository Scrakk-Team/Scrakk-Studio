/**
 * Permisos de extensiones — ENFORCEMENT en el proceso main.
 *
 * Deny-by-default:
 *  - La extensión debe declarar "permissions" en su manifest.
 *  - fs.read/fs.write están enjaulados a los roots del workspace abierto.
 *  - Rutas sensibles denegadas SIEMPRE (shared/permissions).
 *
 * Canales escopados: `ext:fs-*` reciben { extensionId, path } y validan
 * contra el manifest instalado antes de tocar disco.
 */

import { ipcMain } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { app } from 'electron'
import {
  checkPathAccess,
  hasPermission,
  PERMISSIONS,
  type PathAccessContext,
  type PathAccessResult
} from '@shared/permissions'

// ── Registro de roots del workspace ────────────────────────────────────────

const workspaceRoots = new Set<string>()

/** Lo llama el handler de lsp:set-workspace (mismo momento que el Explorer). */
export function setPermissionWorkspaceRoots(roots: string[]): void {
  workspaceRoots.clear()
  for (const root of roots) workspaceRoots.add(path.resolve(root))
}

export function getPermissionWorkspaceRoots(): string[] {
  return [...workspaceRoots]
}

// ── Cache de permisos declarados por extensión ────────────────────────────

const CACHE_TTL_MS = 5_000
const permCache = new Map<string, { permissions: readonly string[] | null; at: number }>()

function extensionsRoot(): string {
  return path.join(app.getPath('userData'), 'extensions')
}

/**
 * Lee los permisos declarados del manifest instalado. null = extensión
 * desconocida → fail-closed. TTL corto para no leer disco por request.
 */
export async function getDeclaredPermissions(extensionId: string): Promise<readonly string[] | null> {
  const cached = permCache.get(extensionId)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.permissions

  let permissions: readonly string[] | null = null
  try {
    const raw = await fs.readFile(
      path.join(extensionsRoot(), path.basename(extensionId), 'manifest.json'),
      'utf-8'
    )
    const manifest = JSON.parse(raw) as { id?: unknown; permissions?: unknown }
    if (
      manifest.id === extensionId &&
      Array.isArray(manifest.permissions) &&
      manifest.permissions.every((p) => typeof p === 'string')
    ) {
      permissions = manifest.permissions as string[]
    }
  } catch {
    // sin manifest legible → null (fail-closed)
  }

  permCache.set(extensionId, { permissions, at: Date.now() })
  return permissions
}

export function invalidatePermissionCache(extensionId?: string): void {
  if (extensionId) permCache.delete(extensionId)
  else permCache.clear()
}

async function accessContext(extensionId: string): Promise<PathAccessContext | null> {
  const declared = await getDeclaredPermissions(extensionId)
  if (!declared) return null
  return {
    declaredPermissions: declared,
    workspaceRoots: getPermissionWorkspaceRoots(),
    homeDir: app.getPath('home')
  }
}

/** Verificación pura sobre el estado real (para tests vía getLspManager-like). */
export async function checkExtensionPathAccess(
  extensionId: string,
  mode: 'read' | 'write',
  targetPath: string
): Promise<PathAccessResult> {
  const ctx = await accessContext(extensionId)
  if (!ctx) return { allowed: false, reason: 'extensión no registrada' }
  return checkPathAccess(ctx, mode, targetPath)
}

/** Gate para permisos no-relacionados-a-rutas (lsp.use, network.fetch…). */
export function checkSimplePermission(
  declared: readonly string[] | null,
  permission: string
): PathAccessResult {
  if (!hasPermission(declared, permission as never)) {
    return { allowed: false, reason: `sin permiso "${permission}"` }
  }
  return { allowed: true }
}

// ── Canales fs escopados ───────────────────────────────────────────────────

interface ScopedFsRequest {
  extensionId: string
  path: string
}

export function registerExtensionFsIpc(): void {
  ipcMain.handle('ext:fs-read', async (_event, request: ScopedFsRequest) => {
    const verdict = await checkExtensionPathAccess(request.extensionId, 'read', request.path)
    if (!verdict.allowed) {
      return { success: false, error: `[permisos] ${verdict.reason}` }
    }
    try {
      const content = await fs.readFile(path.resolve(request.path), 'utf-8')
      return { success: true, content }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(
    'ext:fs-write',
    async (_event, request: ScopedFsRequest & { content: string }) => {
      const target = path.resolve(request.path)
      const verdict = await checkExtensionPathAccess(request.extensionId, 'write', target)
      if (!verdict.allowed) {
        return { success: false, error: `[permisos] ${verdict.reason}` }
      }
      try {
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, request.content, 'utf-8')
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle('ext:lsp-check', async (_event, request: { extensionId: string }) => {
    const declared = await getDeclaredPermissions(request.extensionId)
    return checkSimplePermission(declared, PERMISSIONS.LSP_USE)
  })
}
