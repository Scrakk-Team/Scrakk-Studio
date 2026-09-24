// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Semantic tokens LSP — decodificador del formato delta del protocolo.
 *
 * El server manda data = [deltaLine, deltaStart, length, type, modifiers, …]
 * (5 números por token). Aquí se convierte a posiciones absolutas, listas
 * para pintar en el engine.
 */

export interface DecodedSemanticToken {
  line: number
  startCharacter: number
  length: number
  /** Índice del tokenType en la leyenda del server. */
  tokenType: number
  tokenModifiers: number
}

const TOKENS_PER_ENTRY = 5

/** data cruda del protocolo → tokens absolutos. Leyenda inválida no explota. */
export function decodeSemanticTokens(data: number[] | undefined): DecodedSemanticToken[] {
  if (!data || data.length < TOKENS_PER_ENTRY) return []

  const out: DecodedSemanticToken[] = []
  let line = 0
  let lastStart = 0

  for (let i = 0; i + TOKENS_PER_ENTRY <= data.length; i += TOKENS_PER_ENTRY) {
    const deltaLine = data[i]
    const deltaStart = data[i + 1]
    const length = data[i + 2]
    const tokenType = data[i + 3]
    const tokenModifiers = data[i + 4]

    if (!Number.isFinite(deltaLine) || deltaLine < 0) return out
    line = deltaLine === 0 ? line + 0 : line + deltaLine
    // deltaLine === 0 → deltaStart relativo al token anterior en la MISMA línea.
    const startCharacter = deltaLine === 0 ? lastStart + deltaStart : deltaStart

    out.push({
      line,
      startCharacter,
      length,
      tokenType,
      tokenModifiers
    })

    lastStart = startCharacter
  }

  return out
}
