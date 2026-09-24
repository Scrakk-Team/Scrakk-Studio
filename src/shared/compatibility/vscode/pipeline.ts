// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Pipeline vscode → SEF, por capas (ninguna se salta):
 *
 *   Capa 1 — validate: ¿es un .vsix? (ZIP legible, límites anti-zip-bomb,
 *            package.json válido con name y algo que aportar).
 *   Capa 2 — detectKinds: ¿QUÉ tipo de extensión es? (tabla honesta por
 *            contribution point: supported / pending / unsupported).
 *   Capa 3 — translate: solo los kinds con traductor (registry) intentan
 *            convertirse. Lo roto se omite con warning, jamás tumba.
 *   Capa 4 — verify: cobertura = traducidos / detectados. Si NADA se
 *            tradujo → ERROR honesto (no se instala una extensión vacía).
 *   Capa 5 — build: manifest SEF puro + assets. El core SEF jamás ve el vsix.
 *
 * Namespacing lo decide EL CONVERTER: id `vscode-<pub>.<name>` sanitizado.
 */

import type { CompatReport, ConvertedExtension, MappedApi, UntranslatableError } from '../types'
import { extensionIdOf, displayNameOf } from './extract'
import { analyzeCode } from './analyze'
import { validateVsixBuffer, validateVsixManifest, codedError } from './validate'
import { detectKinds, describeKinds, type KindStatus } from './kinds'
import { TRANSLATORS } from './translators/registry'

const ID_RE = /^[a-z0-9][a-z0-9._-]*$/i

/** App version para el versionCheck (inyectada por main). */
export const COMPAT_ENGINE_CONSTRAINT = '>=0.1.0'

export function safeSefId(raw: string): string {
  const clean = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return clean && ID_RE.test(clean) ? clean : 'vscode-extension'
}

function kindToUntranslatedApi(kind: KindStatus): MappedApi | null {
  if (kind.support === 'supported') return null
  // `code` y `code.browser` no son contribution points: son el paquete en sí.
  const source = kind.key.startsWith('code') ? kind.key : `contributes.${kind.key}`
  return {
    source,
    target: null,
    support: 'none',
    note: kind.reason ?? 'sin traductor a SEF'
  }
}

export function convertVsix(
  buffer: Uint8Array,
  _opts?: { appVersion?: string; fileName?: string }
): ConvertedExtension {
  const fileName = _opts?.fileName ?? 'extension.vsix'

  // ── Capa 1: validación ──────────────────────────────────────────────────
  const entries = validateVsixBuffer(buffer)
  const { manifest, files } = validateVsixManifest(entries, fileName)

  const rawId = extensionIdOf(manifest)
  const id = `vscode-${safeSefId(rawId)}`
  const name = displayNameOf(manifest, rawId)
  const version =
    typeof manifest.version === 'string' && manifest.version.length > 0
      ? manifest.version
      : '0.0.0'

  // ── Capa 2: detección de tipos ──────────────────────────────────────────
  const kinds = detectKinds(manifest)

  // ── Capa 3: traducción (solo kinds con traductor) ───────────────────────
  const contributes: Record<string, unknown[]> = {}
  const outFiles = new Map<string, Uint8Array | string>()
  const translatedMapped: MappedApi[] = []
  /** Campos que los traductores agregan al manifest (ej. `runtime`). */
  const manifestExtras: Record<string, unknown> = {}
  let translatedCount = 0

  for (const translator of TRANSLATORS) {
    if (!translator.detect(manifest)) continue
    const result = translator.translate(manifest, files, { extensionId: id })
    translatedMapped.push(...result.mapped)
    if (result.contributions.length > 0) {
      contributes[translator.sefKind] = result.contributions
      for (const [path, json] of result.assets) outFiles.set(path, json)
      translatedCount += result.contributions.length
    }
    if (result.manifestExtras) Object.assign(manifestExtras, result.manifestExtras)
  }

  // Código JS (main/browser): se analiza para el reporte, no se ejecuta.
  const { mapped: codeMapped, entryPath } = analyzeCode(manifest, files)
  const requiresNode = entryPath !== null && codeMapped.length > 0

  // ── Capa 4: verificación ────────────────────────────────────────────────
  const totalPoints = kinds.reduce((acc, k) => acc + k.count, 0) || 1
  const coverage =
    Math.round(((translatedCount > 0 ? translatedCount : 0) / totalPoints) * 1000) / 1000

  const untranslatedApis = kinds
    .map(kindToUntranslatedApi)
    .filter((m): m is MappedApi => m !== null)
  const failedMapped = translatedMapped.filter((m) => m.support === 'none')
  const okMapped = translatedMapped.filter((m) => m.support !== 'none')

  // NADA traducible → error honesto con la clasificación (no instalar vacío).
  if (translatedCount === 0) {
    const detail = kinds
      .map((k) => `· ${k.label} ×${k.count}: ${k.reason ?? 'sin traductor'}`)
      .join('\n')
    const err = codedError(
      'untranslatable',
      `"${name}" es una extensión VS Code válida, pero Scrakk Studio no puede convertirla:\n${detail}\n\nSoportado hoy: paneles de la activity bar (views/viewsContainers, con su código en el Extension Host), iconos de archivos (iconThemes), temas de color (themes) e iconos de producto (productIconThemes).`
    ) as UntranslatableError
    err.kindsDescription = describeKinds(kinds)
    throw err
  }

  const engineConstraint =
    typeof manifest.engines?.vscode === 'string' ? manifest.engines.vscode : undefined

  const warning =
    coverage >= 1
      ? null
      : `Compatibilidad parcial (${Math.round(coverage * 100)}%): ${untranslatedApis.length + failedMapped.length} aporte(s) sin traductor. Lo traducido funciona; el resto se ignora.`

  const report: CompatReport = {
    coverage,
    supported: okMapped,
    partial: [],
    unsupported: [...failedMapped, ...untranslatedApis],
    warning,
    versionCheck: {
      ok: true,
      detail: engineConstraint ? `engines.vscode ${engineConstraint} (informativo)` : 'sin engines.vscode'
    },
    requiresNode
  }

  // ── Capa 5: manifest SEF puro ───────────────────────────────────────────
  const sefManifest: Record<string, unknown> = {
    id,
    name,
    version,
    author: typeof manifest.publisher === 'string' ? manifest.publisher : manifest.author,
    description:
      typeof manifest.description === 'string'
        ? `[VS Code] ${manifest.description}`
        : '[VS Code] Extensión convertida',
    engine: COMPAT_ENGINE_CONSTRAINT,
    contributes,
    // Campos que sólo algunos traductores aportan (ej. `runtime` con el entry
    // Node para el Extension Host). Sin esto la extensión instalaría sin
    // código y sus paneles quedarían vacíos.
    ...manifestExtras
  }

  outFiles.set('manifest.json', JSON.stringify(sefManifest, null, 2))

  return { id, name, version, manifest: sefManifest, files: outFiles, report }
}
