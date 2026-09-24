// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Estados de git → decoraciones del explorer (badges A/M/??/D/R…).
 *
 * Puro y testeable: dado el estado del repo y una ruta RELATIVA, devuelve
 * el badge. Paleta fija = la de severidades (notis/LSP).
 */

import type { FileDecoration } from '@features/explorer/decorations'
import type { GitStatus } from '@shared/git'

const LETTER_COLORS: Record<string, string> = {
  M: '#d29922',
  A: '#3fb950',
  D: '#f85149',
  R: '#58a6ff',
  C: '#58a6ff',
  U: '#3fb950',
  '?': '#3fb950'
}

const LETTER_WORDS: Record<string, string> = {
  M: 'modificado',
  A: 'añadido',
  D: 'eliminado',
  R: 'renombrado',
  C: 'copiado',
  U: 'sin seguimiento',
  '?': 'sin seguimiento'
}

function wordOf(letter: string): string {
  return LETTER_WORDS[letter] ?? 'cambiado'
}

/** Absoluto → relativo al repo con `/` (null si está fuera). */
export function toRepoRel(root: string, absPath: string): string | null {
  const norm = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const base = norm(root)
  const target = norm(absPath)
  if (target === base) return ''
  if (!target.startsWith(`${base}/`)) return null
  return target.slice(base.length + 1)
}

/**
 * Badge para una ruta relativa al root. Prioridad: staged > unstaged >
 * untracked (igual que VS Code: lo stageado manda).
 */
export function gitFileDecoration(status: Pick<GitStatus, 'staged' | 'unstaged' | 'untracked'>, relPath: string): FileDecoration | null {
  const staged = status.staged.find((f) => f.path === relPath || f.origPath === relPath)
  if (staged) {
    const letter = staged.xy[0] === ' ' ? staged.xy[1] : staged.xy[0]
    const scope = staged.origPath ? ` (desde ${staged.origPath})` : ''
    return {
      badge: letter,
      color: LETTER_COLORS[letter] ?? '#d29922',
      tooltip: `Staged: ${wordOf(letter)}${scope}`
    }
  }
  const unstaged = status.unstaged.find((f) => f.path === relPath || f.origPath === relPath)
  if (unstaged) {
    const letter = unstaged.xy[1] === ' ' ? unstaged.xy[0] : unstaged.xy[1]
    return {
      badge: letter,
      color: LETTER_COLORS[letter] ?? '#d29922',
      tooltip: wordOf(letter)
    }
  }
  if (status.untracked.some((f) => f.path === relPath)) {
    return { badge: 'U', color: LETTER_COLORS.U, tooltip: 'Sin seguimiento' }
  }
  return null
}
