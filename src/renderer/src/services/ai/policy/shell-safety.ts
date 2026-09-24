// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Shell safety analyzer — detects dangerous commands
 */

import type { ShellSafetyResult } from './types'

/** Patterns that indicate critical (never-allow) commands */
const CRITICAL_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+(-\w*\s+)*(-[a-zA-Z]*r|-r[a-zA-Z]*)\s+(-\w*\s+)*(-[a-zA-Z]*f|-f[a-zA-Z]*)\s+\//, reason: 'Recursive force delete from root' },
  { pattern: /\brm\s+(-\w*\s+)*--no-preserve-root/, reason: 'rm without root preservation' },
  { pattern: /\bmkfs\b/, reason: 'Filesystem formatting' },
  { pattern: /\bdd\s+if=/, reason: 'Direct disk write' },
  { pattern: /\b:\(\)\s*\{/, reason: 'Fork bomb' },
  { pattern: /\b>\s*\/dev\/sd/, reason: 'Direct disk device write' },
  { pattern: /\bchmod\s+(-\w*\s+)*777\b/, reason: 'World-writable permissions' },
  { pattern: /\bchown\s+(-\w*\s+)*-R\b/, reason: 'Recursive ownership change' },
  { pattern: /\bsudo\s+rm\b/, reason: 'Sudo rm (elevated delete)' },
  { pattern: /\bgit\s+push\s+(-\w*\s+)*--?f/, reason: 'Force push to git' },
  { pattern: /\bdrop\s+database\b/i, reason: 'Database drop' },
  { pattern: /\btruncate\s+table\b/i, reason: 'Table truncation' },
]

/** Patterns that indicate high-risk commands */
const HIGH_RISK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+(-\w*\s+)*(-[a-zA-Z]*r|-r[a-zA-Z]*)/, reason: 'Recursive delete' },
  { pattern: /\brm\s+(-\w*\s+)*(-[a-zA-Z]*f|-f[a-zA-Z]*)/, reason: 'Force delete' },
  { pattern: /\bsudo\b/, reason: 'Superuser execution' },
  { pattern: /\bchmod\s+(-\w*\s+)*(-R|-r)/, reason: 'Recursive permission change' },
  { pattern: /\bkill\s+(-\w*\s+)*-9/, reason: 'Force kill process' },
  { pattern: /\bkillall\b/, reason: 'Kill all processes' },
  { pattern: /\bpkill\b/, reason: 'Kill processes by name' },
  { pattern: /\bshutdown\b/, reason: 'System shutdown' },
  { pattern: /\breboot\b/, reason: 'System reboot' },
]

/** Patterns that indicate medium-risk commands */
const MEDIUM_RISK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bmv\s+/, reason: 'Move/rename operation' },
  { pattern: /\brm\s+/, reason: 'Delete operation' },
  { pattern: /\bcp\s+(-\w*\s+)*(-r|-R)/, reason: 'Recursive copy' },
  { pattern: /\bgit\s+push\b/, reason: 'Git push' },
  { pattern: /\bgit\s+reset\s+(-\w*\s+)*--hard/, reason: 'Hard git reset' },
  { pattern: /\bgit\s+checkout\s+(-\w*\s+)*--/, reason: 'Force git checkout' },
  { pattern: /\bnpm\s+(publish|unpublish)/, reason: 'NPM publish operation' },
  { pattern: /\byarn\s+publish\b/, reason: 'Yarn publish' },
  { pattern: /\bpip\s+install\b/, reason: 'Package installation' },
  { pattern: /\bcurl\b.*\|\s*(sh|bash)/, reason: 'Pipe curl to shell' },
  { pattern: /\bwget\b.*\|\s*(sh|bash)/, reason: 'Pipe wget to shell' },
]

/**
 * Analyze a shell command for safety risks.
 */
export function isDangerousCommand(command: string): ShellSafetyResult {
  const trimmed = command.trim()

  // Check critical patterns first
  for (const { pattern, reason } of CRITICAL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        riskLevel: 'critical',
        reasons: [reason],
        command: trimmed
      }
    }
  }

  // Check high-risk patterns
  const highReasons: string[] = []
  for (const { pattern, reason } of HIGH_RISK_PATTERNS) {
    if (pattern.test(trimmed)) {
      highReasons.push(reason)
    }
  }
  if (highReasons.length > 0) {
    return {
      riskLevel: 'high',
      reasons: highReasons,
      command: trimmed
    }
  }

  // Check medium-risk patterns
  const mediumReasons: string[] = []
  for (const { pattern, reason } of MEDIUM_RISK_PATTERNS) {
    if (pattern.test(trimmed)) {
      mediumReasons.push(reason)
    }
  }
  if (mediumReasons.length > 0) {
    return {
      riskLevel: 'medium',
      reasons: mediumReasons,
      command: trimmed
    }
  }

  return {
    riskLevel: 'low',
    reasons: [],
    command: trimmed
  }
}
