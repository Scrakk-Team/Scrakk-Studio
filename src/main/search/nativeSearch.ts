// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Loader del módulo nativo scrakk-search (Rust + tgrep-core vía NAPI).
 * Si el .node no existe (ej. plataforma sin build), devuelve null
 * y el caller hace fallback al scan TS existente. Sin throw.
 */
import * as path from 'path';
import * as fs from 'fs';

export interface NativeSearch {
  ensureIndex(root: string): string;
  indexStatus(root: string): string;
  searchFiles(root: string, query: string, maxResults?: number): string;
  grepFiles(root: string, pattern: string, caseSensitive?: boolean, maxResults?: number): string;
  watchRoot(root: string): string;
  unwatchRoot(root: string): string;
}

let cached: NativeSearch | null | undefined;
const watchedRoots = new Set<string>();

/**
 * Rutas candidatas del addon.
 *
 * `__dirname` en el main empaquetado es `…/app.asar/out/main`. Un `.node` no
 * puede ejecutarse desde adentro del asar, así que va desempacado
 * (`asarUnpack` en electron-builder.yml) y se buscan LAS DOS rutas: la virtual
 * (que el parche de `fs` de Electron resuelve al archivo real) y la explícita
 * de `app.asar.unpacked`. El copy del build lo deja en `out/main`
 * (`npm run build` corre `native:copy`).
 */
function candidatePaths(): string[] {
  const here = __dirname;
  const unpacked = here.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  const names = ['scrakk-search.linux-x64-gnu.node', 'index.linux-x64-gnu.node'];
  const dirs = [
    here,
    ...(unpacked === here ? [] : [unpacked]),
    path.join(here, '../../native/search'),
    path.join(process.cwd(), 'native/search')
  ];
  return dirs.flatMap((dir) => names.map((name) => path.join(dir, name)));
}

export function getNativeSearch(): NativeSearch | null {
  if (cached !== undefined) return cached;
  const tried: string[] = [];
  for (const p of candidatePaths()) {
    try {
      if (fs.existsSync(p)) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        cached = require(p) as NativeSearch;
        console.log(`[search] addon nativo: ${p}`);
        return cached;
      }
      tried.push(p);
    } catch (error) {
      // Existe pero no carga (glibc/ABI distinta, p. ej. un .node compilado en
      // otra distro): se dice POR QUÉ en vez de degradar la búsqueda en
      // silencio, que es lo que hacía parecer que "funciona" pero lento.
      console.warn(`[search] el addon nativo no carga (${p}): ${(error as Error).message}`);
      tried.push(p);
    }
  }
  console.warn(
    `[search] sin addon nativo; se usa el scan en TS. Buscado en ${tried.length} rutas, p. ej. ${tried[0] ?? '-'}`
  );
  cached = null;
  return cached;
}

export function tryNativeSearchFiles(
  root: string,
  query: string,
  maxResults: number
): Array<{ path: string; name: string; isDirectory: boolean }> | null {
  const n = getNativeSearch();
  if (!n) return null;
  try {
    const parsed = JSON.parse(n.searchFiles(root, query, maxResults)) as Array<{
      path: string;
      name: string;
      isDirectory: boolean;
    }>;
    return parsed;
  } catch {
    return null;
  }
}

export function tryNativeGrep(
  root: string,
  query: string,
  caseSensitive: boolean,
  maxResults: number
): Array<{ file: string; line: number; content: string; preview?: string }> | null {
  const n = getNativeSearch();
  if (!n) return null;
  try {
    const parsed = JSON.parse(
      n.grepFiles(root, query, caseSensitive, maxResults)
    ) as Array<{ file: string; line: number; content: string; preview?: string }>;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Activa el watcher incremental para `root` (una vez por proceso).
 * Fire-and-forget: el hilo Rust reconstruye el índice ~2s tras cada
 * ráfaga de cambios. Sin throw.
 */
export function ensureWatch(root: string): void {
  if (!root || watchedRoots.has(root)) return;
  watchedRoots.add(root);
  try {
    getNativeSearch()?.watchRoot(root);
  } catch {
    // Sin watcher: grep_files sigue con rebuild bajo demanda.
  }
}
