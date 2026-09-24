// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Argumentos de un comando que viene de una extensión.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ TIENE QUE SER TOLERANTE
 *
 * Los args cruzan tres fronteras antes de llegar al IDE: proceso del host →
 * RPC (JSON) → `ipcRenderer`. En el camino:
 *
 *  - el `Uri` del shim deja de ser una instancia y queda como objeto plano
 *    (`{scheme, authority, path, query, fragment}`),
 *  - una extensión puede mandar directamente un **string** (muchas lo hacen
 *    con `vscode.open`),
 *  - y puede haber esquemas VIRTUALES (`scrakk-ext:`, `untitled:`) que NO son
 *    archivos del disco.
 *
 * Vive en `shared` —y no en la UI— porque es lógica pura: la usan los tests,
 * el ejecutor del renderer y cualquier consumidor futuro sin arrastrar React.
 */

/** URI/path de un argumento, o null si no representa un archivo de disco. */
export function argToPath(arg: unknown): string | null {
  if (typeof arg === 'string') {
    const value = arg.trim()
    if (value.length === 0) return null
    // `file:///home/x/a.ts` → `/home/x/a.ts`
    if (value.startsWith('file://')) {
      try {
        return decodeURIComponent(new URL(value).pathname)
      } catch {
        return value.slice('file://'.length)
      }
    }
    return value
  }
  if (arg && typeof arg === 'object') {
    const candidate = arg as { fsPath?: unknown; path?: unknown; scheme?: unknown }
    if (typeof candidate.fsPath === 'string' && candidate.fsPath.length > 0) {
      return candidate.fsPath
    }
    if (typeof candidate.path === 'string' && candidate.path.length > 0) {
      // Sin esquema se asume `file` (es como lo manda VS Code); un esquema
      // virtual NO se abre como archivo del disco: eso fallaría con un
      // mensaje confuso ("no existe /x/y.css").
      const scheme = typeof candidate.scheme === 'string' ? candidate.scheme : 'file'
      if (scheme !== 'file') return null
      return candidate.path
    }
  }
  return null
}

/** Nombre de archivo derivado de un path (para la tab del editor). */
export function baseNameOfPath(path: string): string {
  const parts = path.replace(/\\/g, '/').replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || path
}
