/**
 * Skills de Scrakk — barrel.
 *
 * Formato estándar Agent Skills: una carpeta con `SKILL.md` (frontmatter
 * `name` + `description` y cuerpo markdown). Vive en `.scrakk/skills/` a
 * nivel proyecto o usuario, y también puede aportarla una extensión `.sef`.
 */

export { skillRegistry } from './registry'
export type { SkillInfo, SkillContent, SkillSource } from './registry'
export { parseSkillFile } from './frontmatter'
export type { ParsedSkillFile, SkillFrontmatter } from './frontmatter'
export { installSkill, removeSkill } from './install'
export type { InstallSkillInput } from './install'
