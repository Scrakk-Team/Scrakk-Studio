/**
 * Estado agregado de servers para el chip de la statusbar.
 * Prioridad de alarma: failed > retrying > starting > ready > idle.
 */

import type { LspServerStatus } from '@shared/lsp'

export interface AggregateLspState {
  state: 'failed' | 'retrying' | 'starting' | 'ready' | 'idle'
  counts: Record<string, number>
  total: number
}

export function aggregateServerState(statuses: LspServerStatus[]): AggregateLspState {
  const counts: Record<string, number> = {}
  for (const status of statuses) {
    counts[status.state] = (counts[status.state] ?? 0) + 1
  }

  const total = statuses.length
  const pick = (...states: string[]): boolean =>
    states.some((state) => (counts[state] ?? 0) > 0)

  let state: AggregateLspState['state'] = 'idle'
  if (total === 0) state = 'idle'
  else if (pick('failed')) state = 'failed'
  else if (pick('retrying')) state = 'retrying'
  else if (pick('starting')) state = 'starting'
  else if ((counts['ready'] ?? 0) > 0) state = 'ready'

  return { state, counts, total }
}
