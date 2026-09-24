// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Policy engine — decide allow / deny / ask por tool call.
 *
 * Orden de resolución (espejo de scrakk-cli):
 *   1. Reglas de permisos del usuario (`permissions.allow/ask/deny`): deny >
 *      ask > allow. Los efectos del MODO deciden qué hacer con un `ask`.
 *   2. `bypassPermissions`: aprueba todo.
 *   3. Shell safety (comandos riesgosos).
 *   4. Comportamiento de mutación del modo.
 *   5. `promptPolicy: 'deny'` (dontAsk) convierte una confirmación en negación.
 *   6. Default: ALLOW.
 */

import { ApprovalMode, PolicyDecision } from './types'
import type { PolicyRule, PolicyConfig, PolicyCheckResult, ShellSafetyResult, ModeDefinition } from './types'
import { isDangerousCommand } from './shell-safety'
import { registry } from '../tools/registry'
import { modeRegistry, BUILTIN_MODE_IDS } from './modeRegistry'
import {
  evaluatePermissionRules,
  type AccessKind,
  type PermissionRule
} from './permissionRules'
import { autoModeVerdict } from './autoMode'

const DEFAULT_MUTATION_TOOLS = new Set([
  'write_file', 'append_file', 'replace_in_file',
  'delete_file', 'move_file',
])

const DEFAULT_SHELL_TOOLS = new Set([
  'execute_command',
])

interface EngineConfig extends PolicyConfig {
  /** Id de modo (CLI): default, acceptEdits, plan, auto, dontAsk, bypassPermissions. */
  modeId: string
  /** Reglas del usuario cargadas de `.scrakk/permissions.json`. */
  permissionRules: PermissionRule[]
}

/** Traduce un tool call a un `AccessKind` (o null si no aplica política). */
export function accessForToolCall(
  toolName: string,
  args: Record<string, unknown>
): AccessKind | null {
  const asString = (value: unknown): string | null =>
    typeof value === 'string' && value.length > 0 ? value : null

  switch (toolName) {
    case 'execute_command':
      return { kind: 'bash', command: asString(args.command) ?? '' }
    case 'read_file':
      return { kind: 'read', path: asString(args.path) }
    case 'read_multiple_files': {
      const files = Array.isArray(args.files) ? args.files : []
      const first = files.find((f): f is string => typeof f === 'string') ?? null
      return { kind: 'read', path: first }
    }
    case 'write_file':
    case 'append_file':
    case 'replace_in_file':
    case 'delete_file':
    case 'move_file':
      return {
        kind: 'edit',
        path: asString(args.path) ?? asString(args.destination) ?? ''
      }
    case 'grep_search':
      return { kind: 'grep', path: asString(args.path) }
    case 'file_search':
      return { kind: 'grep', path: null }
    case 'web_fetch':
      return { kind: 'web_fetch', url: asString(args.url) ?? '' }
    case 'web_search':
      return { kind: 'web_search', query: asString(args.query) ?? '' }
    default:
      return null
  }
}

export class PolicyEngine {
  private config: EngineConfig

  constructor(config?: Partial<EngineConfig>) {
    this.config = {
      mode: config?.mode ?? ApprovalMode.DEFAULT,
      modeId: config?.modeId ?? BUILTIN_MODE_IDS[ApprovalMode.DEFAULT],
      rules: config?.rules ?? [],
      shellDangerPatterns: config?.shellDangerPatterns ?? [],
      permissionRules: config?.permissionRules ?? []
    }
  }

  setMode(mode: ApprovalMode): void {
    this.config.mode = mode
    this.config.modeId = BUILTIN_MODE_IDS[mode]
  }

  /** Mejor esfuerzo: mapea el id de modo actual al enum histórico. */
  getMode(): ApprovalMode {
    switch (this.config.modeId) {
      case 'plan':
        return ApprovalMode.PLAN
      case 'acceptEdits':
      case 'auto_edit':
        return ApprovalMode.AUTO_EDIT
      case 'bypassPermissions':
      case 'all_allow':
        return ApprovalMode.ALL_ALLOW
      default:
        return ApprovalMode.DEFAULT
    }
  }

  setModeId(modeId: string): void {
    if (modeRegistry.get(modeId)) {
      this.config.modeId = modeId
    }
  }

  getModeId(): string {
    return this.config.modeId
  }

  setRules(rules: PolicyRule[]): void {
    this.config.rules = rules
  }

  addRule(rule: PolicyRule): void {
    this.config.rules.push(rule)
    this.config.rules.sort((a, b) => b.priority - a.priority)
  }

  getRules(): PolicyRule[] {
    return [...this.config.rules]
  }

  /** Reglas de permisos del usuario (`permissions.allow/ask/deny`). */
  setPermissionRules(rules: PermissionRule[]): void {
    this.config.permissionRules = rules
  }

  getPermissionRules(): PermissionRule[] {
    return [...this.config.permissionRules]
  }

  isMutationTool(toolName: string): boolean {
    const tool = registry.get(toolName)
    if (tool?.mutationBehavior === 'always') return true
    if (tool?.mutationBehavior === 'never') return false
    if (tool?.mutationBehavior === 'shell') return false
    return DEFAULT_MUTATION_TOOLS.has(toolName)
  }

  isShellTool(toolName: string): boolean {
    const tool = registry.get(toolName)
    if (tool?.mutationBehavior === 'shell') return true
    return DEFAULT_SHELL_TOOLS.has(toolName)
  }

  private getActiveMode(): ModeDefinition | undefined {
    return modeRegistry.get(this.config.modeId)
  }

  async checkTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<PolicyCheckResult> {
    // 1) Reglas propias (legacy) del engine.
    const rules = this.getApplicableRules(toolName, args)
    for (const rule of rules) {
      const result = this.evaluateRule(rule, toolName, args)
      if (result.decision !== PolicyDecision.ALLOW) {
        return result
      }
    }

    const mode = this.getActiveMode()
    const modeLabel = mode?.id ?? this.config.modeId

    // Tools deshabilitadas por el modo: no existen en ese modo y ninguna regla
    // las habilita. Es el "desactivar comandos/herramientas solo en ciertos
    // modos" (p. ej. Plan excluye mutaciones y shell).
    if (mode?.toolFilter) {
      const { include, exclude } = mode.toolFilter
      const fueraDeInclude = include ? !include.includes(toolName) : false
      if (exclude?.includes(toolName) || fueraDeInclude) {
        return {
          decision: PolicyDecision.DENY,
          reason: `[${modeLabel}] tool '${toolName}' is disabled in this mode`
        }
      }
    }

    // 2) Reglas de permisos del usuario (deny > ask > allow), globales + las
    //    acotadas al modo activo.
    const access = accessForToolCall(toolName, args)
    if (access) {
      const verdict = evaluatePermissionRules(access, this.config.permissionRules, this.config.modeId)
      if (verdict === 'deny') {
        return {
          decision: PolicyDecision.DENY,
          reason: `[${modeLabel}] denied by permission policy (${access.kind})`
        }
      }
      if (verdict === 'ask') {
        if (mode?.bypassPermissions) {
          return { decision: PolicyDecision.ALLOW, reason: `[${modeLabel}] policy ask bypassed` }
        }
        if (mode?.promptPolicy === 'deny') {
          return { decision: PolicyDecision.DENY, reason: `[${modeLabel}] policy ask denied` }
        }
        return {
          decision: PolicyDecision.ASK_USER,
          reason: `[${modeLabel}] permission policy requests approval (${access.kind})`
        }
      }
      if (verdict === 'allow') {
        return { decision: PolicyDecision.ALLOW, reason: `[${modeLabel}] allowed by permission policy` }
      }
    }

    // 3) Modo `auto`: fast-paths + heurístico (sin clasificador LLM).
    if (mode?.promptPolicy === 'auto') {
      const verdict = autoModeVerdict({ access, toolName })
      if (verdict === 'allow') {
        return { decision: PolicyDecision.ALLOW, reason: `[${modeLabel}] auto fast-path` }
      }
      return { decision: PolicyDecision.ASK_USER, reason: `[${modeLabel}] auto: needs approval` }
    }

    // 4) bypassPermissions: no hay nada que preguntar.
    if (mode?.bypassPermissions) {
      return { decision: PolicyDecision.ALLOW, reason: `[${modeLabel}] bypassPermissions` }
    }

    // 5) Shell safety.
    if (this.isShellTool(toolName)) {
      const shellResult = this.checkShellSafetyWithMode(args)
      if (shellResult) return this.applyPromptPolicy(shellResult, mode)
    }

    // 6) Comportamiento de mutación del modo.
    if (this.isMutationTool(toolName)) {
      const behavior = mode?.mutationBehavior
      if (behavior === 'never') {
        return {
          decision: PolicyDecision.DENY,
          reason: `[${modeLabel}] Tool '${toolName}' is a mutation. Mutation tools are disabled in this mode.`,
        }
      }
      if (behavior === 'always') {
        return { decision: PolicyDecision.ALLOW, reason: `[${modeLabel}] mutation auto-allowed` }
      }
      if (behavior === 'auto' || behavior === undefined) {
        return this.applyPromptPolicy(
          {
            decision: PolicyDecision.ASK_USER,
            reason: `[${modeLabel}] '${toolName}' is a mutation operation. Approve?`,
          },
          mode
        )
      }
    }

    return { decision: PolicyDecision.ALLOW, reason: 'No rules matched' }
  }

  /** `promptPolicy: 'deny'` (dontAsk) convierte una confirmación en negación. */
  private applyPromptPolicy(
    result: PolicyCheckResult,
    mode: ModeDefinition | undefined
  ): PolicyCheckResult {
    if (result.decision === PolicyDecision.ASK_USER && mode?.promptPolicy === 'deny') {
      return {
        decision: PolicyDecision.DENY,
        reason: `[${mode.id}] confirmation denied (dontAsk)`,
        shellSafety: result.shellSafety
      }
    }
    return result
  }

  private getApplicableRules(toolName: string, args: Record<string, unknown>): PolicyRule[] {
    return this.config.rules.filter(rule => {
      if (rule.type === 'command_prefix' && toolName !== 'execute_command') return false
      if (rule.type === 'extension_filter' && !args.path && !args.file_path) return false
      return true
    }).sort((a, b) => b.priority - a.priority)
  }

  private evaluateRule(
    rule: PolicyRule,
    _toolName: string,
    args: Record<string, unknown>
  ): PolicyCheckResult {
    switch (rule.type) {
      case 'shell_safety':
        return { decision: (rule.allow ?? true) ? PolicyDecision.ALLOW : PolicyDecision.DENY, reason: rule.description, ruleId: rule.id }
      case 'command_prefix':
        return this.evaluateCommandPrefix(rule, args)
      case 'extension_filter':
        return this.evaluateExtensionFilter(rule, args)
      case 'count_limit':
        return this.evaluateCountLimit(rule, args)
      case 'size_limit':
        return { decision: PolicyDecision.ALLOW, reason: 'Size limit check passed', ruleId: rule.id }
      default:
        return { decision: PolicyDecision.ALLOW, reason: `Rule '${rule.type}' not evaluated`, ruleId: rule.id }
    }
  }

  private evaluateCommandPrefix(rule: PolicyRule, args: Record<string, unknown>): PolicyCheckResult {
    const cmd = (args.command as string || '').trim()
    if (!rule.pattern) return { decision: PolicyDecision.ALLOW, reason: 'No pattern defined', ruleId: rule.id }
    const matches = cmd.startsWith(rule.pattern) || cmd.startsWith(` ${rule.pattern}`)
    if (matches && rule.allow === false) {
      return { decision: PolicyDecision.DENY, reason: `Command prefix '${rule.pattern}' is blocked`, ruleId: rule.id }
    }
    return { decision: PolicyDecision.ALLOW, reason: 'Command prefix check passed', ruleId: rule.id }
  }

  private evaluateExtensionFilter(rule: PolicyRule, args: Record<string, unknown>): PolicyCheckResult {
    const path = (args.path as string || args.file_path as string || '')
    const ext = path.split('.').pop()?.toLowerCase()
    if (!ext || !rule.extensions) return { decision: PolicyDecision.ALLOW, reason: 'No extension to check', ruleId: rule.id }
    const allowed = rule.extensions.includes(`.${ext}`)
    if (!allowed) {
      return { decision: PolicyDecision.DENY, reason: `File extension '.${ext}' is not allowed`, ruleId: rule.id }
    }
    return { decision: PolicyDecision.ALLOW, reason: 'Extension check passed', ruleId: rule.id }
  }

  private evaluateCountLimit(rule: PolicyRule, _args: Record<string, unknown>): PolicyCheckResult {
    if (rule.maxCount !== undefined && rule.maxCount <= 0) {
      return { decision: PolicyDecision.DENY, reason: rule.description, ruleId: rule.id }
    }
    return { decision: PolicyDecision.ALLOW, reason: 'Count limit check passed', ruleId: rule.id }
  }

  private checkShellSafetyWithMode(args: Record<string, unknown>): PolicyCheckResult | null {
    const command = (args.command as string || args.task as string || '').trim()
    if (!command) return null

    const result: ShellSafetyResult = isDangerousCommand(command)
    const mode = this.getActiveMode()
    const shellBehavior = mode?.shellBehavior

    if (shellBehavior === 'never') {
      return {
        decision: PolicyDecision.DENY,
        reason: `[${mode?.id}] Shell access is disabled in this mode.`,
        shellSafety: result,
      }
    }

    if (result.riskLevel === 'critical') {
      return {
        decision: PolicyDecision.DENY,
        reason: `Dangerous command blocked: ${result.reasons.join('; ')}`,
        shellSafety: result,
      }
    }

    if (shellBehavior === 'always') {
      return {
        decision: PolicyDecision.ALLOW,
        reason: `[${mode?.id}] Shell auto-allowed`,
        shellSafety: result,
      }
    }

    if (result.riskLevel === 'high') {
      return {
        decision: PolicyDecision.ASK_USER,
        reason: `High-risk command: ${result.reasons.join('; ')}`,
        shellSafety: result,
      }
    }

    if (result.riskLevel === 'medium') {
      return {
        decision: PolicyDecision.ASK_USER,
        reason: `Medium-risk command: ${result.reasons.join('; ')}`,
        shellSafety: result,
      }
    }

    return null
  }
}

export const policyEngine = new PolicyEngine()
