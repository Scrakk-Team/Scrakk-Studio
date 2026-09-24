// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'skills' — lógica.
 *
 * Registra cada SKILL.md del paquete en el registry global de skills. El
 * cuerpo se lee del paquete on-demand (divulgación progresiva): el modelo ve
 * nombre + descripción y carga el contenido solo cuando la necesita.
 */

import { skillRegistry } from '@services/skills'
import type { ExtensionTypeContext } from '../handler'
import type { SkillContribution } from './schema'

export interface RegisteredSkillRef {
  extensionId: string
  name: string
}

export function registerSkill(
  contribution: SkillContribution,
  ctx: ExtensionTypeContext
): RegisteredSkillRef {
  skillRegistry.registerExtensionSkill(
    ctx.extensionId,
    {
      name: contribution.name,
      description: contribution.description,
      path: contribution.path
    },
    () => ctx.readFile(contribution.path)
  )
  return { extensionId: ctx.extensionId, name: contribution.name }
}
