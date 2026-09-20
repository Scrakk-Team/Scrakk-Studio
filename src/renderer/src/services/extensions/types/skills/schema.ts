/**
 * Tipo de extensión 'skills' — schema declarativo.
 *
 * Una extensión `.sef` puede empaquetar skills (estándar Agent Skills): cada
 * contribución apunta a su `SKILL.md` dentro del paquete. Un "pack" es
 * simplemente una extensión con varias entradas bajo `contributes.skills`.
 */

import type { ParseContext } from '../handler'

export interface SkillContribution {
  /** Nombre único de la skill (lo ve el modelo). */
  name: string
  /** Descripción para el descubrimiento (frontmatter o manifest). */
  description: string
  /** Ruta del SKILL.md dentro del paquete. */
  path: string
}

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/

export function parseSkillContributions(
  raw: unknown,
  ctx: ParseContext
): SkillContribution[] | null {
  if (!Array.isArray(raw)) return null
  const out: SkillContribution[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const c = item as Partial<SkillContribution>
    if (
      typeof c.name !== 'string' ||
      !NAME_RE.test(c.name) ||
      typeof c.description !== 'string' ||
      typeof c.path !== 'string'
    ) {
      console.warn('[extensions/skills] contribución inválida descartada:', c)
      continue
    }
    if (!ctx.hasModule(c.path)) {
      console.warn(`[extensions/skills] "${c.name}" sin SKILL.md: ${c.path}`)
      continue
    }
    out.push({ name: c.name, description: c.description, path: c.path })
  }
  return out
}
