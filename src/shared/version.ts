/**
 * Versionado — utilidades compartidas (main + renderer).
 *
 * El IDE compara su versión contra GitHub Releases del repo del proyecto;
 * las extensiones comparan su manifest.engine contra la versión del app.
 * Semver-lite sin dependencias: major.minor.patch con sufijos ignorados.
 */

export interface ParsedVersion {
  major: number
  minor: number
  patch: number
}

/** Parsea 'v0.2.1-beta' → { 0, 2, 1 }. Inválido → null. */
export function parseVersion(raw: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(raw ?? '').trim())
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  }
}

/** -1 | 0 | +1 (a vs b). Versiones inválidas van al final. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa && !pb) return 0
  if (!pa) return 1
  if (!pb) return -1
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (pa[key] !== pb[key]) return pa[key] < pb[key] ? -1 : 1
  }
  return 0
}

/** true si la versión candidata es estrictamente mayor que la actual. */
export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0
}

/**
 * ¿`version` satisface la constraint de engine?
 * Soporta: '>=X.Y.Z', '>X.Y.Z', 'X.Y.Z' y rangos '>=A || >=B' (OR).
 * El formato del manifest es el mismo que ya usa scrakk-cli.
 */
export function satisfiesEngine(version: string, constraint: string | undefined): boolean {
  if (!constraint) return true
  const v = parseVersion(version)
  if (!v) return false

  return constraint
    .split('||')
    .some((part) => satisfiesPart(v, part.trim()))
}

function satisfiesPart(
  v: ParsedVersion,
  part: string
): boolean {
  const ge = /^>=/.test(part)
  const gt = !ge && /^>/.test(part)
  const target = parseVersion(part.replace(/^>=?/, ''))
  if (!target) return true // constraint ilegible: no bloquear

  const cmp =
    v.major !== target.major
      ? v.major < target.major ? -1 : 1
      : v.minor !== target.minor
        ? v.minor < target.minor ? -1 : 1
        : v.patch < target.patch ? -1 : v.patch > target.patch ? 1 : 0

  if (ge) return cmp >= 0
  if (gt) return cmp > 0
  return cmp === 0
}
