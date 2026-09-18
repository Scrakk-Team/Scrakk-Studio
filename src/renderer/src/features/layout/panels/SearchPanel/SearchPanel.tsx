import { useEffect, useRef, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { usePanelTitle } from '@features/layout'
import { openFileInEditor } from '@features/editor'
import type { GrepMatch } from '@shared/fs'
import styles from './SearchPanel.module.css'

const ROOT_KEY = 'scrakk-studio:root-path'
const DEBOUNCE_MS = 250
const MAX_RESULTS = 100

function useWorkspaceRoot(): string | null {
  const [root, setRoot] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ROOT_KEY)
    } catch {
      return null
    }
  })
  useEffect(() => {
    const onChange = (event: Event): void => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path
      if (path) setRoot(path)
    }
    window.addEventListener('workspace-changed', onChange)
    return () => window.removeEventListener('workspace-changed', onChange)
  }, [])
  return root
}

function baseNameOf(path: string): string {
  const clean = path.replace(/[/\\]+$/, '')
  return clean.slice(Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\')) + 1) || clean
}

/**
 * Panel de búsqueda — grep real sobre el workspace vía `fs:search-in-files`
 * (nativo tgrep si está disponible, fallback TS si no).
 */
export function SearchPanel(): JSX.Element {
  const { setTitle } = usePanelTitle()
  const root = useWorkspaceRoot()
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<GrepMatch[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const genRef = useRef(0)

  useEffect(() => {
    setTitle('Búsqueda')
  }, [setTitle])

  useEffect(() => {
    const q = query.trim()
    if (!q || !root) {
      setMatches([])
      setSearching(false)
      setError(null)
      return
    }
    const gen = ++genRef.current
    setSearching(true)
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await window.api.fs.searchInFiles(root, q, undefined, false, MAX_RESULTS)
          if (genRef.current !== gen) return
          if (res.success) {
            setMatches(res.matches ?? [])
            setError(null)
          } else {
            setMatches([])
            setError(res.error ?? 'Falló la búsqueda')
          }
        } catch (e) {
          if (genRef.current !== gen) return
          setMatches([])
          setError(e instanceof Error ? e.message : String(e))
        } finally {
          if (genRef.current === gen) setSearching(false)
        }
      })()
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, root])

  return (
    <div className={styles.search}>
      <div className={styles.box}>
        <ProductIcon id="search" size={14} className={styles.boxIcon} aria-hidden="true" />
        <input
          className={styles.boxInput}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar en archivos…"
          aria-label="Buscar en archivos"
          spellCheck={false}
        />
      </div>

      {!root ? (
        <p className={styles.empty}>Abrí una carpeta para buscar en el workspace.</p>
      ) : !query.trim() ? (
        <p className={styles.empty}>Escribí para buscar en el workspace.</p>
      ) : searching && matches.length === 0 ? (
        <p className={styles.empty}>Buscando…</p>
      ) : error ? (
        <p className={styles.empty}>{error}</p>
      ) : matches.length === 0 ? (
        <p className={styles.empty}>Sin resultados para “{query.trim()}”.</p>
      ) : (
        <div className={styles.results} role="list" aria-label="Resultados de búsqueda">
          <p className={styles.count}>
            {matches.length} resultado{matches.length === 1 ? '' : 's'}
            {matches.length >= MAX_RESULTS ? ' (tope)' : ''}
          </p>
          {matches.map((m, i) => (
            <button
              key={`${m.file}:${m.line}:${i}`}
              type="button"
              role="listitem"
              className={styles.hit}
              onClick={() => openFileInEditor(m.file, baseNameOf(m.file))}
              title={`${m.file}:${m.line}`}
            >
              <span className={styles.hitFile}>{baseNameOf(m.file)}</span>
              <span className={styles.hitLine}>:{m.line}</span>
              <span className={styles.hitPreview}>{m.preview ?? m.content}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
