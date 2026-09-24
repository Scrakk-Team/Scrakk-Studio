// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * SEF tooling — validación de manifest (espejo de las reglas del core).
 *
 * El core valida en runtime; acá se validan en build-time para que el autor
 * descubra errores antes de empaquetar. Devuelve lista de errores (vacía = ok).
 */

import { parseVersion } from '../../src/shared/version.ts'
import { ID_RE, SEF, collectCodePaths } from './config.ts'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export interface ValidationIssue {
  field: string
  message: string
}

/** Valida el manifest crudo contra las reglas del sistema. */
export function validateManifest(manifest: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (typeof manifest.id !== 'string' || !ID_RE.test(manifest.id)) {
    issues.push({ field: 'id', message: 'id requerido (kebab/word chars)' })
  }
  if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
    issues.push({ field: 'name', message: 'name requerido' })
  }
  if (parseVersion(String(manifest.version ?? '')) === null) {
    issues.push({ field: 'version', message: 'version semver requerida (ej. 0.1.0)' })
  }

  // engine, si existe, debe ser una constraint legible.
  if (manifest.engine !== undefined && typeof manifest.engine !== 'string') {
    issues.push({ field: 'engine', message: 'engine debe ser string (ej. ">=0.1.0")' })
  }

  // runtime (extensión con código): objeto con un entry string no vacío.
  if (manifest.runtime !== undefined) {
    const runtime = manifest.runtime as { entry?: unknown } | null
    if (
      !runtime ||
      typeof runtime !== 'object' ||
      typeof runtime.entry !== 'string' ||
      runtime.entry.length === 0
    ) {
      issues.push({
        field: 'runtime',
        message: 'runtime debe ser { kind, entry } con entry string (ej. {"kind":"node","entry":"extension.js"})'
      })
    }
  }

  // permissions solo del catálogo.
  const VALID_PERMISSIONS = new Set([
    'fs.read', 'fs.write', 'fs.all', 'shell.exec', 'network.fetch', 'lsp.use'
  ])
  if (
    manifest.permissions !== undefined &&
    (!Array.isArray(manifest.permissions) ||
      !manifest.permissions.every((p) => typeof p === 'string' && VALID_PERMISSIONS.has(p)))
  ) {
    issues.push({
      field: 'permissions',
      message: `permissions debe ser array de: ${[...VALID_PERMISSIONS].join(', ')}`
    })
  }

  // contributes debe existir con al menos un tipo conocido.
  const contributes = manifest.contributes
  if (!contributes || typeof contributes !== 'object') {
    issues.push({ field: 'contributes', message: 'contributes requerido' })
    return issues
  }
  const c = contributes as Record<string, unknown>
  const KNOWN_KINDS = [
    'panels',
    'views',
    'activityBar',
    'centerTabs',
    'themes',
    'fileIcons',
    'productIcons',
    'lspServers',
    'languages',
    'notifications',
    'encodings',
    'tools',
    'skills'
  ]
  for (const key of Object.keys(c)) {
    if (!KNOWN_KINDS.includes(key)) {
      issues.push({ field: `contributes.${key}`, message: `tipo desconocido (${KNOWN_KINDS.join(', ')})` })
    }
  }

  return issues
}

/**
 * Validación completa de paquete: manifest + existencia de los archivos de
 * código referenciados + data de themes presente.
 */
export async function validatePackage(rootDir: string): Promise<ValidationIssue[]> {
  const manifestPath = path.join(rootDir, SEF.MANIFEST)
  let raw: string
  try {
    raw = await fs.readFile(manifestPath, 'utf-8')
  } catch {
    return [{ field: SEF.MANIFEST, message: `${SEF.MANIFEST} no encontrado en ${rootDir}` }]
  }

  let manifest: Record<string, unknown>
  try {
    manifest = JSON.parse(raw)
  } catch (error) {
    return [{ field: SEF.MANIFEST, message: `JSON inválido: ${String(error)}` }]
  }

  const issues = validateManifest(manifest)
  if (issues.length > 0) return issues

  // Código referenciado debe existir en el repo fuente del autor.
  for (const codePath of collectCodePaths(manifest)) {
    if (!Number.isNaN(Number(codePath))) continue
    try {
      await fs.access(path.join(rootDir, codePath))
    } catch {
      issues.push({ field: codePath, message: 'archivo de código no encontrado' })
    }
  }

  // Themes v2: si hay temas sin path explícito → themes/<id>.json.
  // Convención del paquete: siempre con `/` (en win32 path.join daría `\`).
  const themes = ((manifest.contributes as Record<string, unknown>)?.themes ??
    []) as Array<{ id?: unknown; path?: unknown }>
  for (const theme of themes) {
    if (typeof theme.path === 'string') continue
    const expected = `${SEF.THEMES_DIR}/${String(theme.id)}.json`
    try {
      await fs.access(path.join(rootDir, expected))
    } catch {
      issues.push({
        field: expected,
        message: 'tema sin "path" → se esperaba archivo por convención v2'
      })
    }
  }

  // FileIcons: convención icons/<id>.json si no hay path explícito.
  const fileIcons = ((manifest.contributes as Record<string, unknown>)?.fileIcons ??
    []) as Array<{ id?: unknown; path?: unknown }>
  for (const theme of fileIcons) {
    if (typeof theme.path === 'string') {
      try {
        await fs.access(path.join(rootDir, String(theme.path)))
      } catch {
        issues.push({ field: String(theme.path), message: 'archivo de iconos no encontrado' })
      }
      continue
    }
    const expected = `${SEF.ICONS_DIR}/${String(theme.id)}.json`
    try {
      await fs.access(path.join(rootDir, expected))
    } catch {
      issues.push({
        field: expected,
        message: 'tema de iconos sin "path" → se esperaba archivo por convención'
      })
    }
  }

  // ProductIcons: convención productIcons/<id>.json si no hay path explícito.
  const productIcons = ((manifest.contributes as Record<string, unknown>)?.productIcons ??
    []) as Array<{ id?: unknown; path?: unknown }>
  for (const theme of productIcons) {
    if (typeof theme.path === 'string') {
      try {
        await fs.access(path.join(rootDir, String(theme.path)))
      } catch {
        issues.push({ field: String(theme.path), message: 'archivo de iconos de producto no encontrado' })
      }
      continue
    }
    const expected = `${SEF.PRODUCT_ICONS_DIR}/${String(theme.id)}.json`
    try {
      await fs.access(path.join(rootDir, expected))
    } catch {
      issues.push({
        field: expected,
        message: 'tema de iconos sin "path" → se esperaba archivo por convención'
      })
    }
  }

  return issues
}
