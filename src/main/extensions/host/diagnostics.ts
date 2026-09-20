/**
 * Diagnósticos (REALES, en memoria por extensión).
 *
 * `window.createDiagnosticCollection` / `languages.createDiagnosticCollection`
 * son de las primeras cosas que hace una extensión: ahí publica los problemas
 * que encuentra. Aquí se guardan de verdad, por URI y por colección, así que:
 *
 *  - `languages.getDiagnostics(uri)` devuelve lo que la extensión publicó (hay
 *    extensiones que LEEN diagnósticos de otras y colaboran entre sí),
 *  - `onDidChangeDiagnostics` dispara cuando cambian, y
 *  - el estado sobrevive a la consulta (`has`, `get`, `forEach`).
 *
 * Lo que hace el IDE con ellos: el host los EMPUJA al main en cada cambio
 * (`diagnostics/change`) y la UI los pinta (panel de Problemas + chip de la
 * barra de estado). Antes se quedaban aquí adentro y una extensión que
 * encontraba problemas no los mostraba en ninguna parte.
 */

import type { LspDiagnostic } from '@shared/lsp'
import { EventEmitter, Uri } from './vscodeShim'
import { Diagnostic } from './dataTypes'

export interface DiagnosticCollectionLike {
  name: string
  set(uri: Uri, diagnostics: readonly Diagnostic[]): void
  set(entries: ReadonlyArray<[Uri, readonly Diagnostic[]]>): void
  delete(uri: Uri): void
  clear(): void
  forEach(callback: (uri: Uri, diagnostics: readonly Diagnostic[], collection: unknown) => void): void
  get(uri: Uri): readonly Diagnostic[] | undefined
  has(uri: Uri): boolean
  dispose(): void
}

export class DiagnosticsRegistry {
  /** Colecciones vivas (se limpian al desactivar la extensión). */
  private readonly collections = new Set<DiagnosticsCollectionImpl>()
  readonly onDidChangeDiagnostics = new EventEmitter<{ uris: readonly Uri[] }>()

  createCollection(name: string): DiagnosticCollectionLike {
    const collection = new DiagnosticsCollectionImpl(name, (uris) =>
      this.onDidChangeDiagnostics.fire({ uris })
    )
    this.collections.add(collection)
    return collection
  }

  /** Diagnósticos de UN recurso (los de todas las colecciones, como VS Code). */
  get(uri: Uri): Diagnostic[] {
    const key = uri.toString()
    const result: Diagnostic[] = []
    for (const collection of this.collections) {
      const found = collection.byKey(key)
      if (found) result.push(...found)
    }
    return result
  }

  /** Todos los diagnósticos: `[uri, diagnósticos]` por recurso. */
  all(): Array<[Uri, Diagnostic[]]> {
    const byKey = new Map<string, { uri: Uri; diagnostics: Diagnostic[] }>()
    for (const collection of this.collections) {
      for (const [key, entry] of collection.entries()) {
        const bucket = byKey.get(key) ?? { uri: entry.uri, diagnostics: [] }
        bucket.diagnostics.push(...entry.diagnostics)
        byKey.set(key, bucket)
      }
    }
    return [...byKey.values()].map((entry) => [entry.uri, entry.diagnostics])
  }

  disposeAll(): void {
    // Se capturan los recursos ANTES de limpiar: al desactivar, la UI tiene
    // que borrar sus problemas (si no, quedan fantasmas de una extensión que
    // ya no está corriendo).
    const uris = this.all().map(([uri]) => uri)
    for (const collection of [...this.collections]) collection.dispose()
    this.collections.clear()
    if (uris.length > 0) this.onDidChangeDiagnostics.fire({ uris })
  }

  /**
   * Snapshot serializable de esos recursos (lo que viaja a la UI).
   *
   * Incluye los archivos SIN diagnósticos: ese `[]` es lo que le dice a la UI
   * que deje de mostrar el problema (borrar la entrada en silencio dejaría el
   * error viejo pintado para siempre).
   */
  snapshot(uris: readonly Uri[]): Array<{ path: string; diagnostics: LspDiagnostic[] }> {
    const seen = new Set<string>()
    const entries: Array<{ path: string; diagnostics: LspDiagnostic[] }> = []
    for (const uri of uris) {
      const path = diagnosticsPath(uri)
      if (seen.has(path)) continue
      seen.add(path)
      entries.push({
        path,
        diagnostics: this.get(uri).map(serializeDiagnostic)
      })
    }
    return entries
  }

  /** Todos los diagnósticos de la extensión, ya serializados (por ruta). */
  snapshotAll(): Array<{ path: string; diagnostics: LspDiagnostic[] }> {
    return this.all().map(([uri, list]) => ({
      path: diagnosticsPath(uri),
      diagnostics: list.map(serializeDiagnostic)
    }))
  }

  /** La extensión se apagó: sus colecciones y sus diagnósticos se van con ella. */
  dropCollection(collection: DiagnosticsCollectionImpl): void {
    this.collections.delete(collection)
  }
}

/**
 * Ruta con la que la UI identifica el recurso.
 *
 * Un documento virtual (`cline-diff:`, un log generado) no tiene ruta en
 * disco: se manda la URI completa para que el problema al menos tenga
 * identidad propia en la lista (y no se mezcle con un archivo real homónimo
 * de otro esquema).
 */
export function diagnosticsPath(uri: Uri): string {
  return uri.scheme === 'file' ? uri.fsPath : uri.toString()
}

/**
 * `vscode.Diagnostic` → `LspDiagnostic`.
 *
 * La única trampa es la SEVERIDAD: VS Code numera Error = 0 y el LSP
 * Error = 1. Copiar el número tal cual convertiría cada error en un hint (y
 * el filtro de la UI los descartaría en silencio, que es la peor forma de
 * perder un error).
 */
export function serializeDiagnostic(diagnostic: Diagnostic): LspDiagnostic {
  const rawCode = diagnostic.code
  const code =
    rawCode !== undefined && rawCode !== null && typeof rawCode === 'object'
      ? rawCode.value
      : rawCode
  return {
    range: {
      start: { line: diagnostic.range.start.line, character: diagnostic.range.start.character },
      end: { line: diagnostic.range.end.line, character: diagnostic.range.end.character }
    },
    severity: severityToLsp(diagnostic.severity),
    message: diagnostic.message,
    ...(diagnostic.source ? { source: diagnostic.source } : {}),
    ...(code !== undefined ? { code } : {})
  }
}

/** Severidad de VS Code (0..3) a la del LSP (1..4). Desconocida = Info. */
export function severityToLsp(severity: number | undefined): number {
  if (typeof severity !== 'number' || !Number.isFinite(severity)) return 3
  const clamped = Math.min(3, Math.max(0, Math.floor(severity)))
  return clamped + 1
}

/**
 * Colección de diagnósticos de UN nombre (lo que devuelve
 * `createDiagnosticCollection`).
 */
export class DiagnosticsCollectionImpl implements DiagnosticCollectionLike {
  private readonly store = new Map<string, { uri: Uri; diagnostics: readonly Diagnostic[] }>()

  constructor(
    readonly name: string,
    private readonly notify: (uris: readonly Uri[]) => void
  ) {}

  set(
    uriOrEntries: Uri | ReadonlyArray<[Uri, readonly Diagnostic[]]> | undefined,
    diagnostics?: readonly Diagnostic[]
  ): void {
    // Una llamada sin recurso no es un error que deba matar a la extensión
    // (el host sobrevive a un descuido del llamador); sí es un no-op, no un
    // "se guardó": no hay nada que guardar.
    if (!uriOrEntries) return
    const changed: Uri[] = []
    if (Array.isArray(uriOrEntries)) {
      for (const [uri, list] of uriOrEntries as ReadonlyArray<[Uri, readonly Diagnostic[]]>) {
        this.store.set(uri.toString(), { uri, diagnostics: list })
        changed.push(uri)
      }
    } else {
      const uri = uriOrEntries as Uri
      this.store.set(uri.toString(), { uri, diagnostics: diagnostics ?? [] })
      changed.push(uri)
    }
    if (changed.length > 0) this.notify(changed)
  }

  delete(uri: Uri): void {
    if (!this.store.delete(uri.toString())) return
    this.notify([uri])
  }

  clear(): void {
    if (this.store.size === 0) return
    const uris = [...this.store.values()].map((entry) => entry.uri)
    this.store.clear()
    this.notify(uris)
  }

  forEach(callback: (uri: Uri, diagnostics: readonly Diagnostic[], collection: unknown) => void): void {
    for (const entry of [...this.store.values()]) {
      callback(entry.uri, entry.diagnostics, this)
    }
  }

  get(uri: Uri): readonly Diagnostic[] | undefined {
    return this.store.get(uri.toString())?.diagnostics
  }

  has(uri: Uri): boolean {
    return this.store.has(uri.toString())
  }

  byKey(key: string): readonly Diagnostic[] | undefined {
    return this.store.get(key)?.diagnostics
  }

  entries(): Array<[string, { uri: Uri; diagnostics: readonly Diagnostic[] }]> {
    return [...this.store.entries()]
  }

  dispose(): void {
    this.store.clear()
  }
}
