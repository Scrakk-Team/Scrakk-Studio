// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { useLayout } from '@features/layout'
import {
  subscribeToGit,
  getActiveRoot,
  getRepoState,
  detectRepos
} from '@services/git'
import styles from './GitChip.module.css'

const ROOT_KEY = 'scrakk-studio:root-path'

/**
 * GitChip — rama actual + estado en la statusbar.
 *
 * Punto verde = limpio, ámbar = cambios; ↑↓ = ahead/behind. Click alterna
 * el panel de git. Se oculta si no hay repo activo. Dispara la detección
 * (siempre montado, aunque el panel nunca se abra).
 */
export function GitChip(): JSX.Element | null {
  const { toggleSlotPanel } = useLayout()
  const [, setTick] = useState(0)

  useEffect(() => subscribeToGit(() => setTick((t) => t + 1)), [])

  useEffect(() => {
    const detect = (): void => {
      try {
        const root = localStorage.getItem(ROOT_KEY)
        if (root) void detectRepos(root)
      } catch {
        // Sin storage: nada que detectar.
      }
    }
    detect()
    const onChange = (): void => detect()
    window.addEventListener('workspace-changed', onChange)
    return () => window.removeEventListener('workspace-changed', onChange)
  }, [])

  const root = getActiveRoot()
  const state = root ? getRepoState(root) : null
  if (!root || !state) return null

  const dirty =
    state.staged.length + state.unstaged.length + state.untracked.length > 0
  const counts =
    state.ahead || state.behind
      ? `${state.ahead ? `↑${state.ahead}` : ''}${state.behind ? `↓${state.behind}` : ''}`
      : null
  const title = state.branch
    ? `${state.branch}${dirty ? ' · cambios sin commitear' : ' · limpio'}${
        counts ? ` · ${counts}` : ''
      }${state.upstream ? ` · ${state.upstream}` : ''}`
    : 'Git: sin rama'

  return (
    <button
      type="button"
      className={styles.chip}
      onClick={() => toggleSlotPanel('right', 'git')}
      title={title}
      aria-label="Git: abrir panel"
    >
      <span
        className={[styles.dot, dirty ? styles.dotDirty : styles.dotClean].join(' ')}
        aria-hidden="true"
      />
      <ProductIcon id="source-control" size={12} />
      <span className={styles.name}>{state.branch ?? '—'}</span>
      {counts ? <span className={styles.counts}>{counts}</span> : null}
    </button>
  )
}
