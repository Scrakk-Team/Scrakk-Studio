/**
 * Policy engine types
 */

export enum ApprovalMode {
  PLAN = 'plan',
  DEFAULT = 'default',
  AUTO_EDIT = 'auto_edit',
  ALL_ALLOW = 'all_allow',
}

export type ModeMutationBehavior = 'always' | 'never' | 'auto'
export type ModeShellBehavior = 'always' | 'never' | 'auto'

export interface ModeDefinition {
  id: string
  label: string
  description?: string
  color?: string
  prompt: string
  mutationBehavior: ModeMutationBehavior
  shellBehavior: ModeShellBehavior
  toolFilter?: { include?: string[]; exclude?: string[] }
  extensionId?: string
}

export enum PolicyDecision {
  ALLOW = 'allow',
  DENY = 'deny',
  ASK_USER = 'ask_user',
}

export type PolicyRuleType =
  | 'shell_safety'
  | 'path_allow'
  | 'path_block'
  | 'command_prefix'
  | 'extension_filter'
  | 'count_limit'
  | 'size_limit'

export interface PolicyRule {
  id: string
  type: PolicyRuleType
  priority: number
  label: string
  description: string
  pattern?: string
  patterns?: string[]
  allow?: boolean
  maxCount?: number
  maxSize?: number
  extensions?: string[]
}

export interface ShellSafetyResult {
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  reasons: string[]
  command: string
  parsed?: { command: string; args: string[] }
}

export interface PolicyCheckResult {
  decision: PolicyDecision
  reason: string
  ruleId?: string
  shellSafety?: ShellSafetyResult
}

export interface PolicyConfig {
  mode: ApprovalMode
  rules: PolicyRule[]
  shellDangerPatterns?: string[]
}

export const MODES_BY_PERMISSIVENESS: ApprovalMode[] = [
  ApprovalMode.PLAN,
  ApprovalMode.DEFAULT,
  ApprovalMode.AUTO_EDIT,
  ApprovalMode.ALL_ALLOW,
]

export const DANGEROUS_COMMAND_PATTERNS: string[] = [
  'rm -rf /',
  'rm -rf --no-preserve-root',
  'mkfs',
  'dd if=',
  '> /dev/sda',
  ':(){ :|:& };:',
  'wget.*| sh',
  'curl.*| sh',
  'chmod -R 777',
  'chown -R',
  'mv /.*',
  'sudo rm',
  'git push --force',
  'git push -f',
  'drop database',
  'truncate table',
]
