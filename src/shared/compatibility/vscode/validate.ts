/**
 * Capa 1 — Validación del .vsix (seguridad + formato).
 *
 * Un .vsix es un ZIP con un package.json que declara `contributes`.
 * Aquí NO se traduce nada: solo se verifica que el archivo sea lo que dice
 * ser, con límites anti-zip-bomb y anti-traversal. Cada fallo devuelve un
 * error con código para que la UI explique QUÉ está mal.
 */

import { unzipSync } from 'fflate'
import type { VsixPackageJson } from '../types'

/** Límites de seguridad (un .vsix real de iconos/temas pesa KB–pocos MB). */
export const VSIX_LIMITS = {
  /** 100 MB comprimido: más que eso no es una extensión, es otra cosa. */
  maxBytes: 100 * 1024 * 1024,
  /** 20k archivos: más que eso huele a zip-bomb. */
  maxFiles: 20_000
} as const

export type VsixValidationCode =
  | 'empty'
  | 'too-large'
  | 'not-a-zip'
  | 'too-many-files'
  | 'no-package-json'
  | 'bad-package-json'
  | 'no-name'
  | 'no-contributes'

export interface VsixValidationIssue {
  code: VsixValidationCode
  message: string
}

export interface ValidatedVsix {
  manifest: VsixPackageJson
  /** Todos los archivos del zip (paths con `/`, sin `../`). */
  files: Array<{ path: string; data: Uint8Array }>
}

/** ¿El path del zip es seguro para materializar? (anti-traversal). */
export function isSafeZipPath(p: string): boolean {
  if (!p || p.includes('..') || p.startsWith('/') || p.startsWith('\\')) return false
  if (/^[a-zA-Z]:/.test(p)) return false
  return true
}

function norm(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '')
}

/**
 * Capa 1a: el buffer es un ZIP legible dentro de límites.
 * Lanza Error con `code` si no lo es.
 */
export function validateVsixBuffer(buffer: Uint8Array): Record<string, Uint8Array> {
  if (!buffer || buffer.length === 0) {
    throw codedError('empty', 'El archivo está vacío.')
  }
  if (buffer.length > VSIX_LIMITS.maxBytes) {
    throw codedError(
      'too-large',
      `El archivo pesa ${(buffer.length / 1024 / 1024).toFixed(1)} MB (límite ${VSIX_LIMITS.maxBytes / 1024 / 1024} MB).`
    )
  }
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(buffer) as Record<string, Uint8Array>
  } catch {
    throw codedError('not-a-zip', 'No es un .vsix válido (el ZIP no se pudo abrir).')
  }
  const names = Object.keys(entries)
  if (names.length === 0 || names.length > VSIX_LIMITS.maxFiles) {
    throw codedError(
      'too-many-files',
      `El ZIP trae ${names.length} archivos (límite ${VSIX_LIMITS.maxFiles}).`
    )
  }
  return entries
}

/**
 * Capa 1b: el manifest existe y es un package.json de extensión válido.
 * Requiere `name`; exige ALGÚN contribution point o `main`/`browser`
 * (una extensión sin nada que aportar no es instalable).
 */
export function validateVsixManifest(
  entries: Record<string, Uint8Array>,
  originalName: string
): ValidatedVsix {
  const files: Array<{ path: string; data: Uint8Array }> = []
  const candidates: Array<{ path: string; data: Uint8Array }> = []

  for (const [rawKey, data] of Object.entries(entries)) {
    const path = norm(rawKey)
    if (path.endsWith('/')) continue
    if (path === '[Content_Types].xml' || path.endsWith('.vsixmanifest')) continue
    if (!isSafeZipPath(path)) continue
    files.push({ path, data })
    if (path.split('/').pop() === 'package.json') candidates.push({ path, data })
  }

  if (candidates.length === 0) {
    throw codedError(
      'no-package-json',
      `"${originalName}" no contiene package.json: no es una extensión VS Code.`
    )
  }

  // extension/package.json > package.json raíz (igual que VS Code).
  const score = (p: string): number =>
    p === 'extension/package.json' || p.endsWith('/extension/package.json')
      ? 2
      : p === 'package.json'
        ? 1
        : 0
  const sorted = [...candidates].sort((a, b) => score(b.path) - score(a.path))

  let manifest: VsixPackageJson | null = null
  for (const { data } of sorted) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(data)) as VsixPackageJson
      if (parsed && typeof parsed === 'object' && (parsed.contributes || parsed.name)) {
        manifest = parsed
        break
      }
    } catch {
      // package.json roto: probar el siguiente candidato.
    }
  }

  if (!manifest) {
    throw codedError(
      'bad-package-json',
      'El package.json del .vsix está roto o no declara name/contributes.'
    )
  }
  if (typeof manifest.name !== 'string' || manifest.name.trim() === '') {
    throw codedError('no-name', 'El package.json no tiene "name": no se puede identificar.')
  }

  const contributes = manifest.contributes ?? {}
  const hasPoints =
    typeof contributes === 'object' &&
    Object.values(contributes).some((v) => (Array.isArray(v) ? v.length > 0 : v != null))
  if (!hasPoints && !manifest.main && !manifest.browser) {
    throw codedError(
      'no-contributes',
      `"${manifest.name}" no aporta nada (sin contributes ni main): no hay qué convertir.`
    )
  }

  return { manifest, files }
}

export interface CodedVsixError extends Error {
  code: VsixValidationCode | 'untranslatable'
}

function codedError(code: VsixValidationCode | 'untranslatable', message: string): CodedVsixError {
  const err = new Error(message) as CodedVsixError
  err.code = code
  return err
}

export { codedError }
