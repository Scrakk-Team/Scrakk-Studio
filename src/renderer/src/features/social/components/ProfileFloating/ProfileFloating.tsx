// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { ProfileView, type ProfileViewData } from '../ProfileView/ProfileView'
import styles from './ProfileFloating.module.css'

interface FloatingProfileState {
  id: string
  anchor: DOMRect
  profile: ProfileViewData
  onExpand?: () => void
}

let seq = 0
let current: FloatingProfileState | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function showFloatingProfile(opts: { anchor: DOMRect; profile: ProfileViewData; onExpand?: () => void }): string {
  const id = `fp-${++seq}`
  current = { id, anchor: opts.anchor, profile: opts.profile, onExpand: opts.onExpand }
  emit()
  return id
}

export function hideFloatingProfile(id?: string): void {
  if (!current) return
  if (id && current.id !== id) return
  current = null
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getState(): FloatingProfileState | null {
  return current
}

/**
 * Host global del floating profile (estilo context menu): se posiciona cerca del anchor,
 * sin overlay centrado, y se cierra con Esc o click afuera.
 */
export function ProfileFloatingHost(): JSX.Element | null {
  const [state, setState] = useState<FloatingProfileState | null>(() => getState())

  useEffect(() => subscribe(() => setState(getState())), [])

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideFloatingProfile(state.id)
    }
    const onClick = (e: MouseEvent) => {
      const el = document.querySelector(`[data-floating-id="${state.id}"]`)
      if (el && !el.contains(e.target as Node)) hideFloatingProfile(state.id)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick, true)
    }
  }, [state])

  if (!state) return null

  const { anchor, profile, onExpand } = state
  // Posicionar a la derecha del anchor, con clamp
  const width = 280
  const gap = 8
  let left = anchor.right + gap
  let top = anchor.top
  if (left + width > window.innerWidth - 8) left = anchor.left - width - gap
  if (left < 8) left = 8
  if (top + 320 > window.innerHeight - 8) top = window.innerHeight - 328
  if (top < 8) top = 8

  const content = (
    <div
      data-floating-id={state.id}
      className={styles.card}
      style={{ left, top, width }}
      role="dialog"
      aria-label={`Perfil de ${profile.name}`}
    >
      <ProfileView profile={profile} config={{ avatarSize: 56, showDescription: true, showDNI: false, compact: false }} />
      {profile.description ? null : null}
      <div className={styles.footer}>
        <button type="button" className={styles.expandBtn} onClick={() => {
          hideFloatingProfile(state.id)
          onExpand?.()
        }}>
          Ver perfil completo
        </button>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
