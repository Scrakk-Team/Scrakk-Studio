// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Selector de emojis del chat — popover con búsqueda, categorías y recientes.
 *
 * Sin dependencias ni imágenes: los emojis son Unicode, así que no gastan R2.
 */

import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { EMOJI_CATEGORIES, ALL_EMOJIS, type EmojiEntry } from './data'
import styles from './EmojiPicker.module.css'

const RECENT_KEY = 'scrakk-studio:emoji-recent'
const MAX_RECENT = 16

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function writeRecent(list: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)))
  } catch {
    /* sin storage: se ignora */
  }
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function EmojiPicker({ onPick }: { onPick: (char: string) => void }): JSX.Element {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(EMOJI_CATEGORIES[0]?.id ?? '')
  const [recent, setRecent] = useState<string[]>(() => readRecent())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = useMemo<EmojiEntry[]>(() => {
    const q = normalize(query.trim())
    if (q.length === 0) return []
    return ALL_EMOJIS.filter((emoji) => normalize(emoji.name).includes(q)).slice(0, 120)
  }, [query])

  const currentCategory = EMOJI_CATEGORIES.find((entry) => entry.id === category) ?? EMOJI_CATEGORIES[0]

  const handlePick = (char: string): void => {
    onPick(char)
    const next = [char, ...recent.filter((item) => item !== char)].slice(0, MAX_RECENT)
    setRecent(next)
    writeRecent(next)
  }

  const recentEntries: EmojiEntry[] = recent.map((char) => ({ char, name: 'reciente' }))
  const searching = query.trim().length > 0

  return (
    <div className={styles.panel} role="dialog" aria-label="Emojis">
      <div className={styles.head}>
        <input
          ref={inputRef}
          className={styles.search}
          value={query}
          placeholder="Buscar emoji…"
          aria-label="Buscar emoji"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {!searching ? (
        <div className={styles.tabs}>
          {recentEntries.length > 0 ? (
            <button
              type="button"
              className={`${styles.tab} ${category === '__recent' ? styles.tabActive : ''}`}
              title="Recientes"
              onClick={() => setCategory('__recent')}
            >
              🕘
            </button>
          ) : null}
          {EMOJI_CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`${styles.tab} ${category === entry.id ? styles.tabActive : ''}`}
              title={entry.label}
              onClick={() => setCategory(entry.id)}
            >
              {entry.emojis[0]?.char ?? entry.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles.grid}>
        {searching
          ? results.map((emoji) => (
              <button
                key={`${emoji.char}-${emoji.name}`}
                type="button"
                className={styles.emoji}
                title={emoji.name}
                onClick={() => handlePick(emoji.char)}
              >
                {emoji.char}
              </button>
            ))
          : (category === '__recent' ? recentEntries : currentCategory.emojis).map((emoji) => (
              <button
                key={`${emoji.char}-${emoji.name}`}
                type="button"
                className={styles.emoji}
                title={emoji.name}
                onClick={() => handlePick(emoji.char)}
              >
                {emoji.char}
              </button>
            ))}
        {searching && results.length === 0 ? (
          <span className={styles.empty}>Sin resultados</span>
        ) : null}
      </div>
    </div>
  )
}
