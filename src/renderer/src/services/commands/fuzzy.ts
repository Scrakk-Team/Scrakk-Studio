// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Fuzzy match simple para la paleta: subsecuencia case-insensitive sobre
 * "title + category + id", con bonus por inicio de palabra y consecutivos.
 * Puro y testeable.
 */

export interface FuzzyResult {
  score: number
}

/**
 * Devuelve score > 0 si `query` matchea como subsecuencia de `text`.
 * Mayor = mejor. 0 = no matchea.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().trim()
  const t = text.toLowerCase()
  if (!q) return 1 // query vacía: listar todo con score base
  if (!t) return 0

  let qi = 0
  let score = 0
  let streak = 0
  let prevMatchAt = -2

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      streak++
      // Bonus: inicio de palabra o consecutivo.
      const isWordStart = ti === 0 || /[\s./:-]/.test(t[ti - 1] ?? '')
      score += isWordStart ? 3 : 1
      if (prevMatchAt === ti - 1) score += streak
      prevMatchAt = ti
      qi++
    } else {
      streak = 0
    }
  }

  return qi === q.length ? score : 0
}
