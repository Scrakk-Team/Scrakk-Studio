// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Instalación / borrado de skills en `.scrakk/skills`.
 *
 * Usa la API global de `.scrakk` (misma que el LSP): crea y borra archivos
 * reales en la capa de proyecto o usuario. El registry se refresca solo, así
 * que la skill queda disponible para el modelo al instante.
 */

import { scrakkHandle, scrakkProjectRoot, type ScrakkScope } from '../scrakk'
import { skillRegistry } from './registry'

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/

export interface InstallSkillInput {
  name: string
  description: string
  /** Cuerpo markdown (sin frontmatter). */
  body: string
  /** Capa destino; default proyecto. */
  scope?: ScrakkScope
}

/** Crea `.scrakk/skills/<name>/SKILL.md` con el frontmatter estándar. */
export async function installSkill(input: InstallSkillInput): Promise<{ ok: boolean; error?: string }> {
  const name = input.name.trim()
  if (!NAME_RE.test(name)) {
    return { ok: false, error: 'Nombre inválido: letras, números, punto, guion y guion bajo' }
  }
  const scope: ScrakkScope = input.scope ?? 'project'
  if (scope === 'project' && !scrakkProjectRoot()) {
    return { ok: false, error: 'No hay proyecto abierto' }
  }
  const content = [
    '---',
    `name: ${name}`,
    `description: ${input.description.trim()}`,
    '---',
    '',
    input.body.trim(),
    ''
  ].join('\n')
  const handle = scrakkHandle(scope, 'skills')
  const written = await handle.write(`${name}/SKILL.md`, content)
  if (!written.ok) return { ok: false, error: written.error }
  await skillRegistry.refresh()
  return { ok: true }
}

/** Borra `.scrakk/skills/<name>` de la capa indicada. */
export async function removeSkill(
  name: string,
  scope: ScrakkScope = 'project'
): Promise<{ ok: boolean; error?: string }> {
  if (!NAME_RE.test(name.trim())) return { ok: false, error: 'Nombre inválido' }
  const handle = scrakkHandle(scope, 'skills')
  const removed = await handle.remove(name.trim())
  if (!removed.ok) return { ok: false, error: removed.error }
  await skillRegistry.refresh()
  return { ok: true }
}
