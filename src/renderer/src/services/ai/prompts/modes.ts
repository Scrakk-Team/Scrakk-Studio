/**
 * Modos de aprobación — fuentes de verdad centralizadas.
 *
 * Patrón de Scrakk Code Editor: cada modo tiene su propio PROMPT que se
 * inyecta en el system prompt (getPromptForMode), su etiqueta y su color
 * (usado por el glow del input). La fuente de verdad del modo activo es
 * `toolSettingsService.getApprovalMode()` (persistido), con fallback al
 * policy engine.
 */

import { modeRegistry } from '../policy/modeRegistry'
import { policyEngine } from '../policy'
import { toolSettingsService } from '../toolSettings'

/** Etiquetas cortas en español para los modos built-in. */
export const MODE_LABELS: Record<string, string> = {
  default: 'Predeterminado',
  plan: 'Plan',
  acceptEdits: 'Aceptar ediciones',
  auto: 'Automático',
  dontAsk: 'No preguntar',
  bypassPermissions: 'Omitir permisos',
  // Alias históricos.
  auto_edit: 'Auto editar',
  all_allow: 'Permitir todo'
}

/** Ids que son alias de otro modo: no se listan ni se ciclan. */
const ALIAS_MODE_IDS = new Set(['auto_edit', 'all_allow'])

/** Prompts canónicos por modo (usados cuando el ModeDefinition no trae prompt). */const CANONICAL_MODE_PROMPTS: Record<string, string> = {
  plan: `You are in PLAN mode (READ-ONLY). You CAN read files, list directories, search code and browse the web, but mutation tools (write_file, replace_in_file, append_file, delete_file, move_file) and shell commands are BLOCKED and will be denied. Focus on understanding the codebase, analyzing architecture and producing detailed plans. Do NOT attempt to modify files.`,
  default: `Mode: DEFAULT — operations that modify files or run shell commands may require user confirmation before proceeding. Work efficiently, but expect approval prompts for destructive or risky actions.`,
  acceptEdits: `Mode: ACCEPT EDITS — file edits are auto-approved. Make changes without asking first, but shell commands may still require confirmation.`,
  auto: `Mode: AUTO — a classifier reviews each tool call. Safe actions run automatically; anything risky or destructive is blocked and the user is asked. Keep actions explainable and reversible.`,
  dontAsk: `Mode: DON'T ASK — never ask for confirmation. Operations that would need approval are denied instead, so prefer actions already allowed and avoid destructive changes.`,
  bypassPermissions: `Mode: BYPASS PERMISSIONS — every operation (file mutations and shell commands) is auto-approved without asking. Use with caution.`,
  // Alias históricos.
  auto_edit: `Mode: AUTO EDIT — file edits are auto-approved. Make changes without asking first, but shell commands may still require confirmation.`,
  all_allow: `Mode: ALLOW ALL — every operation (file mutations and shell commands) is auto-approved without asking. Use with caution.`
}

/** Id del modo activo (fuente: toolSettings persistido, fallback policy engine). */
export function getModeId(): string {
  return (
    toolSettingsService.getApprovalMode() ||
    policyEngine.getModeId() ||
    'default'
  )
}

/** Etiqueta visible del modo (español para built-in). */
export function getModeLabel(modeId: string): string {
  return MODE_LABELS[modeId] ?? modeRegistry.get(modeId)?.label ?? modeId
}

/** Color del modo (para el glow y el dot). */
export function getModeColor(modeId: string): string {
  return modeRegistry.get(modeId)?.color ?? '#888888'
}

/**
 * Prompt del modo para el system prompt (patrón scrakk): usa el prompt del
 * ModeDefinition si está definido; si no, el canónico de este módulo.
 */
export function getPromptForMode(modeId: string): string {
  const def = modeRegistry.get(modeId)
  if (def?.prompt && def.prompt.trim().length > 0) return def.prompt.trim()
  return CANONICAL_MODE_PROMPTS[modeId] ?? ''
}

/** Aplica un modo: policy engine + toolSettings + aviso al resto de la app. */
export function applyMode(modeId: string): void {
  policyEngine.setModeId(modeId)
  toolSettingsService.setApprovalMode(modeId)
  window.dispatchEvent(new CustomEvent('approval-mode-changed', { detail: { mode: modeId } }))
}

/** Cicla al siguiente modo canónico del registry (default → plan → …). */
export function cycleMode(): void {
  const modes = modeRegistry.getAll().filter((mode) => !ALIAS_MODE_IDS.has(mode.id))
  if (modes.length === 0) return
  const current = getModeId()
  const index = modes.findIndex((mode) => mode.id === current)
  applyMode(modes[(index + 1 + modes.length) % modes.length].id)
}
