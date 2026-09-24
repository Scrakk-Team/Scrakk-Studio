// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * SkillCard — muestra qué skill se cargó y cuántas líneas trae.
 */

import type { JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'
import './SkillCard.css'

interface SkillCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function SkillCard({ args, result, status }: SkillCardProps): JSX.Element | null {
  const name = typeof args.name === 'string' ? args.name : ''
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <ToolShimmerText text={name ? `Loading skill: ${name}…` : 'Loading skill…'} />
  }
  if (!name) return null
  const lines = result ? result.split('\n').length : 0
  return (
    <span className="skill-card">
      Skill: {name}
      {lines > 0 ? <span className="skill-card__lines"> · {lines} líneas</span> : null}
    </span>
  )
}
