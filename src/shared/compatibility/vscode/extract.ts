/**
 * Compatibility/vscode — extracción del .vsix (fflate, puro JS).
 * Port minimal de scrakk-gpu-backup install/extract.ts + packageJson.ts.
 * Sin dependencias de renderer (window/document): usable en main y tests.
 */

import { unzipSync } from 'fflate'
import type { VsixFileEntry, VsixPackageJson } from '../types'

const TEXT_DECODER = new TextDecoder()

export function decodeText(data: Uint8Array): string {
  return TEXT_DECODER.decode(data)
}

function toBase64Binary(data: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < data.length; i += CHUNK) {
    const sub = data.subarray(i, i + CHUNK)
    binary += String.fromCharCode(...sub)
  }
  if (typeof btoa === 'function') return btoa(binary)
  // Fallback sin btoa/Buffer (entornos mínimos): encoder base64 manual.
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < binary.length; i += 3) {
    const a = binary.charCodeAt(i)
    const b = i + 1 < binary.length ? binary.charCodeAt(i + 1) : 0
    const c = i + 2 < binary.length ? binary.charCodeAt(i + 2) : 0
    const n = (a << 16) | (b << 8) | c
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63]
    out += i + 1 < binary.length ? chars[(n >> 6) & 63] : '='
    out += i + 2 < binary.length ? chars[n & 63] : '='
  }
  return out
}

export { toBase64Binary }

/** Normaliza separadores y limpia prefijos relativos. */
function norm(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '')
}

export function resolveVsixFile(
  wanted: string,
  files: VsixFileEntry[]
): VsixFileEntry | null {
  const w = norm(wanted)
  // VS Code resuelve el `main` como Node: `./out/extension` es
  // `out/extension.js` (y si es un directorio, su `index.js`). Sin esto, las
  // extensiones que declaran el entry sin extensión quedan sin código.
  const hasExtension = /\.[a-z0-9]+$/i.test(w)
  const candidates = hasExtension
    ? [w]
    : [`${w}.js`, `${w}.cjs`, `${w}.mjs`, `${w}/index.js`]

  for (const candidate of candidates) {
    // 1) Exacto.
    const exact = files.find((f) => f.path === candidate)
    if (exact) return exact
    // 2) Con prefijo extension/ (o cualquier carpeta raíz del zip).
    const prefixed = files.find((f) => f.path === `extension/${candidate}`)
    if (prefixed) return prefixed
    // 3) Sufijo (el zip trae carpetas intermedias).
    const suffixed = files.find((f) => f.path.endsWith(`/${candidate}`))
    if (suffixed) return suffixed
    // 4) Sin ./ ni ../.
    const cleaned = candidate.replace(/(\.\.\/|\.\/)/g, '')
    const loose =
      files.find((f) => f.path === cleaned || f.path.endsWith(`/${cleaned}`)) ?? null
    if (loose) return loose
  }
  return null
}

/**
 * Resuelve una ruta de asset relativa al archivo del tema
 * (iconPath, font src…): une con el directorio del tema y normaliza
 * segmentos (`./`, `../`, `\`, `/` inicial). Devuelve null si el `../`
 * escapa por encima de la raíz del paquete (antipatrón/traversal: el
 * asset se descarta en el traductor en vez de resolverse fuera).
 */
export function resolveThemeAsset(themePath: string, rel: string): string | null {
  const cleaned = norm(rel)
  // Ruta absoluta (/icons/x.svg): relativa a la RAÍZ del paquete, no al tema.
  const base = cleaned.startsWith('/')
    ? ''
    : (() => {
        const dir = norm(themePath)
        return dir.includes('/') ? dir.substring(0, dir.lastIndexOf('/') + 1) : ''
      })()
  const joined = cleaned.replace(/^\//, '')
  const out: string[] = []
  for (const seg of `${base}${joined}`.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      if (out.length === 0) return null
      out.pop()
      continue
    }
    out.push(seg)
  }
  return out.length > 0 ? out.join('/') : null
}

export interface ParsedVsix {
  manifest: VsixPackageJson
  files: VsixFileEntry[]
}

/** Elige el package.json real entre candidatos del zip (scoring). */
function pickPackageJson(candidates: VsixFileEntry[]): VsixFileEntry | null {
  let best: VsixFileEntry | null = null
  let bestScore = -1
  for (const c of candidates) {
    let score = 0
    if (c.path === 'extension/package.json') score = 2
    else if (c.path === 'package.json') score = 1
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  // Fallback: cualquier package.json suelto.
  if (!best && candidates.length > 0) best = candidates[0]
  return best
}

export function extractVsix(buffer: Uint8Array): ParsedVsix {
  const entries = unzipSync(buffer)
  const files: VsixFileEntry[] = []
  for (const [rawKey, data] of Object.entries(entries)) {
    const path = norm(rawKey)
    if (path.endsWith('/')) continue
    if (path === '[Content_Types].xml' || path.endsWith('.vsixmanifest')) continue
    files.push({ path, data: data as Uint8Array })
  }

  const candidates = files.filter((f) => f.path.endsWith('package.json'))
  const pkgFile = pickPackageJson(candidates)
  if (!pkgFile) throw new Error('El .vsix no contiene package.json')

  const manifest = JSON.parse(decodeText(pkgFile.data)) as VsixPackageJson
  if (!manifest?.name && !manifest?.contributes) {
    throw new Error('package.json del .vsix sin name ni contributes')
  }
  return { manifest, files }
}

export function extensionIdOf(manifest: VsixPackageJson): string {
  const pub = manifest.publisher?.trim()
  const name = manifest.name?.trim() ?? 'unknown'
  return pub ? `${pub}.${name}` : name
}

export function displayNameOf(manifest: VsixPackageJson, fallback: string): string {
  return manifest.displayName?.trim() || manifest.name?.trim() || fallback
}
