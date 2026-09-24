// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo de extensión 'tools' — schema declarativo.
 *
 * Una extensión `.sef` aporta herramientas de IA igual que las built-in:
 * nombre + descripción + JSON Schema de parámetros, un `command` que la
 * extensión registra (y que corre en el Extension Host) y, opcionalmente, un
 * visual React del propio paquete (`visual/`), igual que las tools internas.
 *
 * Las contribuciones rotas se descartan con warning: nunca tumban el boot.
 */

import type { PermissionRule, ToolMeta } from '@services/ai/tools'
import type { ParseContext } from '../handler'

export type ToolDangerLevel = ToolMeta['dangerLevel']

const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/
const DANGER_LEVELS: ToolDangerLevel[] = ['safe', 'low', 'medium', 'high']

export interface ToolContribution {
  /** Nombre de la función que ve el modelo (único). */
  name: string
  /** Etiqueta visible en el chat y en Ajustes. */
  label?: string
  description: string
  /** JSON Schema de los parámetros (opcional). */
  parameters?: Record<string, unknown>
  /** Comando de la extensión que ejecuta la tool. */
  command: string
  /**
   * Grupo de la tool. La extensión puede declarar su PROPIO pack:
   * `family` (id) + `familyLabel`, y un `type` (id) + `typeLabel`.
   * Si no existen, se crean solos (catálogo extensible).
   */
  type?: string
  typeLabel?: string
  family?: string
  familyLabel?: string
  familyIcon?: string
  dangerLevel?: ToolDangerLevel
  enabledByDefault?: boolean
  /** Id de productIcon. */
  icon?: string
  /** Clave(s) del argumento a mostrar en el header de la card. */
  headerArgKey?: string | string[]
  /** Módulo React del paquete con el visual (default export). */
  visual?: string
  /** CSS del visual, inyectado tal cual. */
  visualCss?: string
  /** Reglas del motor de políticas (path_block, size_limit, …). */
  permissions?: PermissionRule[]
}

function parsePermissions(raw: unknown): PermissionRule[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: PermissionRule[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rule = item as Partial<PermissionRule>
    if (typeof rule.id !== 'string' || typeof rule.type !== 'string') continue
    out.push({
      id: rule.id,
      type: rule.type,
      label: rule.label ?? rule.id,
      description: rule.description ?? '',
      defaultAllowed: rule.defaultAllowed ?? true
    })
  }
  return out.length > 0 ? out : undefined
}

export function parseToolContributions(
  raw: unknown,
  ctx: ParseContext
): ToolContribution[] | null {
  if (!Array.isArray(raw)) return null
  const out: ToolContribution[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const c = item as Partial<ToolContribution>
    if (
      typeof c.name !== 'string' ||
      !NAME_RE.test(c.name) ||
      typeof c.description !== 'string' ||
      c.description.trim().length === 0 ||
      typeof c.command !== 'string' ||
      c.command.trim().length === 0
    ) {
      console.warn('[extensions/tools] contribución inválida descartada:', c)
      continue
    }
    if (c.visual && !ctx.hasModule(c.visual)) {
      console.warn(`[extensions/tools] "${c.name}" sin visual: ${c.visual}`)
    }
    out.push({
      name: c.name,
      label: typeof c.label === 'string' ? c.label : undefined,
      description: c.description,
      parameters:
        c.parameters && typeof c.parameters === 'object'
          ? (c.parameters as Record<string, unknown>)
          : undefined,
      command: c.command,
      type: typeof c.type === 'string' && c.type.trim() ? c.type.trim() : undefined,
      typeLabel: typeof c.typeLabel === 'string' ? c.typeLabel : undefined,
      family: typeof c.family === 'string' && c.family.trim() ? c.family.trim() : undefined,
      familyLabel: typeof c.familyLabel === 'string' ? c.familyLabel : undefined,
      familyIcon: typeof c.familyIcon === 'string' ? c.familyIcon : undefined,
      dangerLevel: DANGER_LEVELS.includes(c.dangerLevel as ToolDangerLevel)
        ? (c.dangerLevel as ToolDangerLevel)
        : 'medium',
      enabledByDefault: c.enabledByDefault !== false,
      icon: typeof c.icon === 'string' ? c.icon : undefined,
      headerArgKey: c.headerArgKey,
      visual: c.visual,
      visualCss: typeof c.visualCss === 'string' ? c.visualCss : undefined,
      permissions: parsePermissions(c.permissions)
    })
  }
  return out
}
