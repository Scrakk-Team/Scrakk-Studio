// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Copia el .node nativo junto al bundle del main (`out/main/`) para que
 * el loader lo encuentre tanto en dev como en la app empaquetada.
 * Sin deps. Idempotente.
 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const destDir = join(repoRoot, 'out', 'main');

const nodes = readdirSync(join(here, 'search')).filter((f) => f.endsWith('.node'));
if (nodes.length === 0) {
  console.log('[native:copy] no hay .node en native/search (corre npm run native:build primero)');
  process.exit(0);
}
mkdirSync(destDir, { recursive: true });
for (const n of nodes) {
  const src = join(here, 'search', n);
  const dst = join(destDir, n);
  // SIEMPRE se copia: saltear "si ya existe" dejaba el .node viejo en out/main
  // después de un `native:build`, o sea que el empaquetado salía con el addon
  // anterior y el bug "en prod usa el viejo" era invisible.
  copyFileSync(src, dst);
  console.log(`[native:copy] ${n} -> out/main/`);
}
