// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * ListSkillsCard — muestra cuántas skills hay y sus nombres.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'
import './ListSkillsCard.css'

interface ListSkillsCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function ListSkillsCard({ result, status }: ListSkillsCardProps): JSX.Element | null {
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text="Listing skills…" />
  }
  let names: string[] = []
  if (result) {
    try {
      const parsed = JSON.parse(result) as Array<{ name?: string }>
      names = parsed.map((entry) => entry.name ?? '').filter(Boolean)
    } catch {
      names = []
    }
  }
  const suffix = names.length === 1 ? 'skill' : 'skills'
  return (
    <span className="list-skills-card">
      {names.length > 0 ? `${names.length} ${suffix}: ${names.join(', ')}` : 'No hay skills'}
    </span>
  )
}
