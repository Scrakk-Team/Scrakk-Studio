// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Shell safety analyzer — detects dangerous commands
 */

import type { ShellSafetyResult } from './types'

/** Patterns that indicate critical (never-allow) commands */
const CRITICAL_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // `rm -rf /`, `rm -fr /*`, `rm -r -f /`… (el patrón viejo no cubría `-rf`).
  { pattern: /\brm\s+(?:-\S+\s+)*(?:\/|\/\*|~\/?|\$HOME)(?:\s|$)/, reason: 'Recursive force delete from root' },
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
  // Ejecución de un payload descargado, sin pasar por un archivo visible.
  { pattern: /\b(bash|sh|zsh|dash|ksh)\s+(-c|--command)\b.*\b(curl|wget)\b/i, reason: 'Shell executing downloaded content' },
  { pattern: /\b(curl|wget)\b[^|]*\|\s*(bash|sh|zsh|dash|ksh)\b/i, reason: 'Pipe download to shell' },
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
  // Intérpretes: la lista negra de comandos no ve qué hace el payload.
  { pattern: /\b(bash|sh|zsh|dash|ksh)\s+(-c|--command)\b/i, reason: 'Inline shell payload' },
  { pattern: /\b(node|deno|bun)\s+(-e|--eval)\b/i, reason: 'Inline Node/Deno/Bun payload' },
  { pattern: /\b(python[0-9.]*|ruby|perl|php)\s+(-c|-e|-r)\b/i, reason: 'Inline interpreter payload' },
  // Exfiltración / movimiento lateral.
  { pattern: /\b(nc|ncat|netcat|socat|telnet)\b/i, reason: 'Raw network tool' },
  { pattern: /\b(ssh|scp|sftp)\b/i, reason: 'Remote shell/file transfer' },
  { pattern: /\b(curl|wget)\b[^\n]*(\s-T\b|--upload-file|\s-d\b|--data\b|--form\b|\s-F\b|--post-data|--post-file)/i, reason: 'Upload/exfiltrate via HTTP' },
  { pattern: /\b(base64|xxd|openssl)\b[^\n]*\|\s*(curl|wget|nc|ncat|socat|ssh)\b/i, reason: 'Encode and exfiltrate' },
  // Credenciales y persistencia.
  { pattern: /(^|\/)(\.ssh|\.aws|\.gcloud|\.kube|\.gnupg)(\/|$)|(id_rsa|id_ed25519|\.netrc)/i, reason: 'Reads credential paths' },
  { pattern: /\b(crontab|systemctl\s+--user|launchctl|schtasks)\b/i, reason: 'Persistence mechanism' },
  { pattern: /\breg\s+add\b/i, reason: 'Windows registry persistence' },
  { pattern: /\beval\b|\bsource\s+<\(/i, reason: 'Dynamic shell evaluation' },
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
  { pattern: /\b(curl|wget)\b/i, reason: 'Network download' },
  { pattern: /\b(env|printenv)\b/i, reason: 'Dumps environment (may contain secrets)' },
  { pattern: /\bhistory\b/i, reason: 'Reads shell history' },
  { pattern: /\b(chmod|chown|chgrp)\b/i, reason: 'Changes permissions/ownership' },
  { pattern: /\b(kubectl|docker|podman|aws|gcloud|az)\b/i, reason: 'Cloud/container control' },
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
