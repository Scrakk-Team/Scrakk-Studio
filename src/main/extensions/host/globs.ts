/**
 * Glob mínimo para `workspace.findFiles`.
 *
 * El IDE NO necesita el motor de globs completo de VS Code: las extensiones de
 * paneles piden cosas como `**\/*.json`, `**\/*.{ts,tsx}`, `src/**\/*.css` o
 * `package.json`. Alcanza con traducir a regex y cubrir esos casos, en vez de
 * sumar una dependencia para esto.
 *
 * Lo que soporta: `**` (cualquier profundidad), `*` (dentro de un segmento),
 * `?` (un caracter), `{a,b}` (alternativas) y `[abc]` (clase). Lo que NO:
 * negación (`!`) ni escapes raros — quien los use va a recibir menos
 * resultados, no un resultado equivocado.
 */

/** Convierte un glob a RegExp anclada (sin `g`: se usa con `test`). */
export function globToRegExp(glob: string): RegExp {
  let out = ''
  let i = 0
  while (i < glob.length) {
    const char = glob[i]
    if (char === '*') {
      // `**/` cruza carpetas enteras; `*` se queda en el segmento.
      if (glob[i + 1] === '*') {
        i += 2
        if (glob[i] === '/') i += 1
        out += '(?:.*/)?'
      } else {
        out += '[^/]*'
        i += 1
      }
      continue
    }
    if (char === '?') {
      out += '[^/]'
      i += 1
      continue
    }
    if (char === '{') {
      const close = glob.indexOf('}', i)
      if (close !== -1) {
        const options = glob.slice(i + 1, close).split(',')
        out += `(?:${options.map(escapeRegExp).join('|')})`
        i = close + 1
        continue
      }
    }
    if (char === '[') {
      const close = glob.indexOf(']', i)
      if (close !== -1) {
        out += glob.slice(i, close + 1)
        i = close + 1
        continue
      }
    }
    out += escapeRegExp(char)
    i += 1
  }
  return new RegExp(`^${out}$`)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * ¿La ruta relativa (con `/`) matchea el glob?
 *
 * Como VS Code: un patrón SIN `/` se compara contra el NOMBRE del archivo
 * (`package.json` matchea a cualquier profundidad), y con `/` se compara
 * contra la ruta relativa.
 */
export function matchesGlob(glob: string, relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/')
  if (!glob.includes('/')) {
    const name = normalized.slice(normalized.lastIndexOf('/') + 1)
    return globToRegExp(glob).test(name)
  }
  return globToRegExp(glob).test(normalized)
}

/**
 * Carpetas que no se caminan NUNCA.
 *
 * Lista corta a propósito: son las que VS Code también ignora por defecto
 * (control de versiones y dependencias instaladas). `out`, `dist` o `build`
 * NO van acá: hay extensiones que justamente buscan artefactos ahí.
 */
export const SKIPPED_DIRS = new Set([
  '.git',
  'node_modules',
  '.cache',
  '.venv',
  '__pycache__'
])
