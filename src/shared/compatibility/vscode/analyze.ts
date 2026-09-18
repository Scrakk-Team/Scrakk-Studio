/**
 * Compatibility/vscode — análisis de cobertura (separator → mapper → verifier).
 * Port minimal de scrakk-gpu-backup converter/*: heurística por includes
 * sobre una muestra del entry JS (cap 400KB) + declarativos del manifest.
 */

import type { MappedApi, VsixPackageJson } from '../types'
import { DECLARATIVE_MAP, lookupCodeApi } from './maps'
import { decodeText, resolveVsixFile } from './extract'
import type { VsixFileEntry } from '../types'

/**
 * Marcadores que se buscan en el bundle. Es un MUESTREO (no un análisis real):
 * dice "esta extensión usa esto" para que el reporte no sea adivinanza. Los
 * marcadores DEBEN corresponder a filas de `CODE_MAP` (hay un test).
 */
export const CODE_MARKERS = [
  'vscode.commands.registerCommand',
  'vscode.commands.executeCommand',
  'vscode.window.showInformationMessage',
  'vscode.window.showWarningMessage',
  'vscode.window.showErrorMessage',
  'vscode.window.showQuickPick',
  'vscode.window.showInputBox',
  'vscode.window.createWebviewPanel',
  'vscode.window.registerWebviewViewProvider',
  'vscode.window.registerTreeDataProvider',
  'vscode.window.createTreeView',
  'vscode.window.createStatusBarItem',
  'vscode.window.createOutputChannel',
  'vscode.window.withProgress',
  'vscode.workspace.fs',
  'vscode.workspace.getConfiguration',
  'vscode.workspace.findFiles',
  'vscode.workspace.createFileSystemWatcher',
  'vscode.workspace.applyEdit',
  'vscode.languages.register',
  'vscode.debug',
  'vscode.scm',
  'vscode.tasks',
  'vscode.comments',
  'vscode.notebooks',
  'vscode.tests'
]

function candidateEntryPaths(manifest: VsixPackageJson): string[] {
  const out: string[] = []
  if (manifest.main) out.push(manifest.main)
  if (manifest.browser) out.push(manifest.browser)
  out.push('dist/extension.js', 'out/extension.js', 'extension.js')
  return out
}

export interface AnalysisResult {
  mapped: MappedApi[]
  coverage: number
  requiresNode: boolean
  entryPath: string | null
}

/** Mapea los contribution points declarativos del manifest. */
export function analyzeDeclarative(manifest: VsixPackageJson): MappedApi[] {
  const out: MappedApi[] = []
  const contributes = manifest.contributes ?? {}
  for (const [key, value] of Object.entries(contributes)) {
    if (value === undefined || value === null) continue
    const arr = Array.isArray(value) ? value : [value]
    if (arr.length === 0) continue
    const mapKey = `contributes.${key}`
    const entry = DECLARATIVE_MAP[mapKey] ?? {
      target: null,
      support: 'none' as const,
      note: 'contribution point no mapeado'
    }
    out.push({ source: mapKey, target: entry.target, support: entry.support, note: entry.note })
  }
  return out
}

/** Muestrea el entry JS y mapea APIs imperativas por includes. */
export function analyzeCode(
  manifest: VsixPackageJson,
  files: VsixFileEntry[]
): { mapped: MappedApi[]; entryPath: string | null } {
  const mapped: MappedApi[] = []
  for (const candidate of candidateEntryPaths(manifest)) {
    const file = resolveVsixFile(candidate, files)
    if (!file || file.data.length > 2_500_000) continue
    let sample: string
    try {
      sample = decodeText(file.data.subarray(0, 400_000))
    } catch {
      continue
    }
    const seen = new Set<string>()
    for (const marker of CODE_MARKERS) {
      if (sample.includes(marker) && !seen.has(marker)) {
        seen.add(marker)
        const entry = lookupCodeApi(marker)
        mapped.push({ source: marker, target: entry.target, support: entry.support, note: entry.note })
      }
    }
    return { mapped, entryPath: candidate }
  }
  return { mapped, entryPath: null }
}

export function verifyCoverage(mapped: MappedApi[]): number {
  if (mapped.length === 0) return 1
  const score = mapped.reduce((acc, m) => {
    if (m.support === 'full') return acc + 1
    if (m.support === 'partial') return acc + 0.5
    return acc
  }, 0)
  return Math.round((score / mapped.length) * 1000) / 1000
}

export function analyzeVsix(manifest: VsixPackageJson, files: VsixFileEntry[]): AnalysisResult {
  const declarative = analyzeDeclarative(manifest)
  const { mapped: codeMapped, entryPath } = analyzeCode(manifest, files)
  const mapped = [...declarative, ...codeMapped]
  const requiresNode = entryPath !== null && codeMapped.length > 0
  return { mapped, coverage: verifyCoverage(mapped), requiresNode, entryPath }
}
