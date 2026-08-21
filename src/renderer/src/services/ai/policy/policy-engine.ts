/**
 * Policy engine — decides whether to allow, deny, or ask user for tool calls.
 *
 * Resolution order:
 *   1. Custom rules (path_block, command_prefix, etc.)
 *   2. Shell safety analysis (for shell-using tools)
 *   3. Mutation behavior (for file-editing tools)
 *   4. Default: ALLOW
 */

import { ApprovalMode, PolicyDecision } from './types'
import type { PolicyRule, PolicyConfig, PolicyCheckResult, ShellSafetyResult, ModeDefinition } from './types'
import { isDangerousCommand } from './shell-safety'
import { registry } from '../tools/registry'
import { modeRegistry, BUILTIN_MODE_IDS } from './modeRegistry'

const DEFAULT_MUTATION_TOOLS = new Set([
  'write_file', 'append_file', 'replace_in_file',
  'delete_file', 'move_file',
])

const DEFAULT_SHELL_TOOLS = new Set([
  'execute_command',
])

export class PolicyEngine {
  private config: PolicyConfig

  constructor(config?: Partial<PolicyConfig>) {
    this.config = {
      mode: config?.mode ?? ApprovalMode.DEFAULT,
      rules: config?.rules ?? [],
      shellDangerPatterns: config?.shellDangerPatterns ?? [],
    }
  }

  setMode(mode: ApprovalMode): void {
    this.config.mode = mode
  }

  getMode(): ApprovalMode {
    return this.config.mode
  }

  setModeId(modeId: string): void {
    const def = modeRegistry.get(modeId)
    if (def) {
      if (def.id === BUILTIN_MODE_IDS[ApprovalMode.PLAN]) this.config.mode = ApprovalMode.PLAN
      else if (def.id === BUILTIN_MODE_IDS[ApprovalMode.AUTO_EDIT]) this.config.mode = ApprovalMode.AUTO_EDIT
      else if (def.id === BUILTIN_MODE_IDS[ApprovalMode.ALL_ALLOW]) this.config.mode = ApprovalMode.ALL_ALLOW
      else if (def.id === BUILTIN_MODE_IDS[ApprovalMode.DEFAULT]) this.config.mode = ApprovalMode.DEFAULT
      else this.config.mode = ApprovalMode.DEFAULT
    }
  }

  getModeId(): string {
    return BUILTIN_MODE_IDS[this.config.mode]
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
    return modeRegistry.get(BUILTIN_MODE_IDS[this.config.mode])
  }

  async checkTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<PolicyCheckResult> {
    // Check custom rules
    const rules = this.getApplicableRules(toolName, args)
    for (const rule of rules) {
      const result = this.evaluateRule(rule, toolName, args)
      if (result.decision !== PolicyDecision.ALLOW) {
        return result
      }
    }

    // Check shell safety
    if (this.isShellTool(toolName)) {
      const shellResult = this.checkShellSafetyWithMode(args)
      if (shellResult) return shellResult
    }

    // Check mutation behavior
    if (this.isMutationTool(toolName)) {
      const mode = this.getActiveMode()
      const behavior = mode?.mutationBehavior
      if (behavior === 'never') {
        return {
          decision: PolicyDecision.DENY,
          reason: `[${mode?.id ?? 'plan'} mode] Tool '${toolName}' is a mutation. Mutation tools are disabled in this mode.`,
        }
      }
      if (behavior === 'always') {
        return { decision: PolicyDecision.ALLOW, reason: `[${mode?.id ?? 'all_allow'}] mutation auto-allowed` }
      }
      if (behavior === 'auto' || behavior === undefined) {
        return {
          decision: PolicyDecision.ASK_USER,
          reason: `[${mode?.id ?? 'default'}] '${toolName}' is a mutation operation. Approve?`,
        }
      }
    }

    return { decision: PolicyDecision.ALLOW, reason: 'No rules matched' }
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
