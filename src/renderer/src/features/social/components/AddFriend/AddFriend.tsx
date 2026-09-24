// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useRef, useState, type ChangeEvent, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import type { SocialUser } from '@shared/social'
import { SOCIAL_RULES } from '@shared/social'
import { UserAvatar } from '../UserAvatar/UserAvatar'
import styles from './AddFriend.module.css'

interface AddFriendProps {
  search: (query: string) => Promise<SocialUser[]>
  onSend: (targetId: string) => Promise<{ ok: boolean; error?: string; status?: string }>
}

const STATUS_TEXT: Record<string, string> = {
  pending: 'Solicitud enviada ✔',
  accepted: '¡Ahora son amigos!',
  already_friends: 'Ya son amigos'
}

/** Busca usuarios por handle/nombre y manda solicitud de amistad. */
export function AddFriend({ search, onSend }: AddFriendProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SocialUser[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [sentIds, setSentIds] = useState<Set<string>>(() => new Set())
  const seq = useRef(0)

  useEffect(() => {
    const needle = query.trim().replace(/^@+/, '')
    if (needle.length < SOCIAL_RULES.searchMin) {
      setResults([])
      return
    }
    const current = ++seq.current
    const timer = setTimeout(() => {
      void search(query.trim()).then((found) => {
        if (current === seq.current) setResults(found)
      })
    }, 220)
    return () => clearTimeout(timer)
  }, [query, search])

  const handleSend = async (userId: string): Promise<void> => {
    setBusyId(userId)
    setNotice(null)
    const result = await onSend(userId)
    setBusyId(null)
    if (!result.ok) {
      setNotice(result.error ?? 'No se pudo enviar la solicitud')
      return
    }
    setNotice(result.status ? STATUS_TEXT[result.status] ?? 'Listo' : 'Listo')
    setSentIds((prev) => new Set(prev).add(userId))
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.search}>
        <ProductIcon id="search" size={13} className={styles.searchIcon} />
        <input
          className={styles.input}
          value={query}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
          placeholder="Buscar por @usuario o nombre…"
          spellCheck={false}
          aria-label="Buscar usuarios"
        />
      </div>

      {notice ? <p className={styles.notice}>{notice}</p> : null}

      {results.length > 0 ? (
        <div className={styles.results} role="listbox" aria-label="Resultados">
          {results.map((user) => {
            const label = user.displayName ?? user.handle ?? 'Usuario'
            const sent = sentIds.has(user.id)
            return (
              <div key={user.id} className={styles.row}>
                <UserAvatar name={label} src={user.avatarUrl ?? undefined} size={30} />
                <span className={styles.main}>
                  <span className={styles.name}>{label}</span>
                  {user.handle ? <span className={styles.handle}>@{user.handle}</span> : null}
                </span>
                <button
                  type="button"
                  className={styles.addBtn}
                  disabled={sent || busyId === user.id}
                  onClick={() => void handleSend(user.id)}
                >
                  <ProductIcon id={sent ? 'check' : 'person-add'} size={13} />
                  {sent ? 'Enviada' : 'Agregar'}
                </button>
              </div>
            )
          })}
        </div>
      ) : query.trim().length > 0 ? (
        <p className={styles.empty}>
          {query.trim().replace(/^@+/, '').length < SOCIAL_RULES.searchMin
            ? `Escribe al menos ${SOCIAL_RULES.searchMin} caracteres.`
            : 'Sin resultados. Prueba con otro @usuario o nombre.'}
        </p>
      ) : null}
    </div>
  )
}
