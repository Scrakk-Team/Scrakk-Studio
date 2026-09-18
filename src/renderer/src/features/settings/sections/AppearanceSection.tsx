/**
 * Sección Apariencia — selector de temas SEF.
 *
 * CERO hardcodeo: los temas vienen del ecosistema de extensiones vía la
 * API de themes (listRegisteredThemes / activateTheme / deactivateTheme /
 * subscribeToThemes). Builtin e instaladas .sef aparecen solas al
 * registrarse; la UI se re-renderiza suscrita a ese stream.
 */

import { useCallback, useEffect, useState, type JSX } from 'react'
import {
  listRegisteredThemes,
  getActiveThemeId,
  activateTheme,
  deactivateTheme,
  subscribeToThemes,
  getFontFallbackMode,
  setFontFallbackMode,
  ExtensionRegistry,
  type RegisteredThemeEntry,
  type FontFallbackMode
} from '@services/extensions'
import styles from './AppearanceSection.module.css'

interface ThemeCardProps {
  theme: RegisteredThemeEntry
  isActive: boolean
  onActivate: (id: string) => void
}

function ThemeSwatches({ theme }: { theme: RegisteredThemeEntry }): JSX.Element {
  const colors = theme.definition.colors
  const swatches = [
    { color: colors.accent, fallback: '#888' },
    { color: colors.editorBg ?? colors.surface, fallback: '#222' },
    { color: colors.bg, fallback: '#000' }
  ]
  return (
    <div className={styles.swatches} aria-hidden="true">
      {swatches.map((swatch, index) => (
        <span
          key={index}
          className={styles.swatch}
          style={{ background: swatch.color ?? swatch.fallback }}
        />
      ))}
    </div>
  )
}

function ThemeCard({ theme, isActive, onActivate }: ThemeCardProps): JSX.Element {
  const author = theme.isBuiltin
    ? 'Scrakk'
    : (ExtensionRegistry.getExtension(theme.extensionId)?.name ?? theme.extensionId)

  return (
    <button
      type="button"
      className={[styles.card, isActive ? styles.cardActive : null]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onActivate(theme.id)}
      title={`${theme.name} (${theme.type})`}
    >
      <span className={styles.cardName}>{theme.name}</span>
      <ThemeSwatches theme={theme} />
      <span className={styles.cardMeta}>
        <span className={[styles.badge, theme.type === 'light' ? styles.badgeLight : null]
          .filter(Boolean)
          .join(' ')}>
          {theme.type === 'light' ? 'Claro' : 'Oscuro'}
        </span>
        <span className={styles.author}>{author}</span>
      </span>
    </button>
  )
}

export function AppearanceSection(): JSX.Element {
  const [themes, setThemes] = useState<RegisteredThemeEntry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [fallback, setFallback] = useState<FontFallbackMode>(() => getFontFallbackMode())

  const refresh = useCallback((): void => {
    setThemes(listRegisteredThemes())
    setActiveId(getActiveThemeId())
  }, [])

  // Stream reactivo del ecosistema de temas: builtin, .sef instaladas en
  // runtime, activación y desinstalación — todo llega por acá.
  useEffect(() => {
    refresh()
    return subscribeToThemes(refresh)
  }, [refresh])

  useEffect(() => subscribeToThemes(() => setFallback(getFontFallbackMode())), [])

  const handleActivate = useCallback((id: string): void => {
    if (!activateTheme(id)) return
    setActiveId(getActiveThemeId())
  }, [])

  const handleReset = useCallback((): void => {
    deactivateTheme()
    setActiveId(getActiveThemeId())
  }, [])

  // Lista ÚNICA: builtin + temas de extensiones .sef, todos juntos.
  // Orden alfabético ESTABLE: activar un tema no mueve su card (solo cambia
  // su badge a "Activo").
  const allThemes = [...themes].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  )

  const activeTheme = themes.find((theme) => theme.id === activeId) ?? null
  const activeFontFamily = activeTheme?.definition.fonts?.ui?.family ?? null

  const pickFallback = (mode: FontFallbackMode): void => {
    setFontFallbackMode(mode)
    setFallback(mode)
  }

  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const visibleThemes = q
    ? allThemes.filter((theme) =>
        [theme.name, theme.id, theme.type].some((field) =>
          field.toLowerCase().includes(q)
        )
      )
    : allThemes

  return (
    <div className={styles.section}>
      <p className={styles.hint}>
        Todos los temas: los que viajan con la app y los que aporten extensiones{' '}
        <code>.sef</code> (aparecen solos al instalarse).
      </p>

      {allThemes.length === 0 ? (
        <p className={styles.empty}>No hay temas registrados todavía.</p>
      ) : (
        <div className={styles.browser}>
          <div className={styles.themeSearchWrap}>
            <input
              className={styles.themeSearchInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar temas…"
              aria-label="Buscar temas"
              spellCheck={false}
            />
          </div>
          {visibleThemes.length === 0 ? (
            <p className={styles.empty}>Sin resultados para “{query.trim()}”.</p>
          ) : (
            <div className={styles.grid}>
              {visibleThemes.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  isActive={theme.id === activeId}
                  onActivate={handleActivate}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeFontFamily ? (
        <div className={styles.fontBox}>
          <div className={styles.fontHead}>
            <span className={styles.fontName}>{activeFontFamily}</span>
            <span className={styles.fontTag}>Fuente del tema</span>
          </div>
          <p className={styles.hint}>Respaldo si no carga (sin internet):</p>
          <div className={styles.fontTabs} role="tablist" aria-label="Respaldo de fuente">
            {(['system', 'original'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={fallback === mode}
                className={[styles.fontTab, fallback === mode ? styles.fontTabActive : null]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => pickFallback(mode)}
              >
                {mode === 'system' ? 'Sistema' : 'Original'}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {activeId !== null ? (
        <div className={styles.activeRow}>
          <span className={styles.activeText}>
            Tema de extensión activo:{' '}
            <strong>{themes.find((theme) => theme.id === activeId)?.name ?? activeId}</strong>
          </span>
          <button type="button" className={styles.resetBtn} onClick={handleReset}>
            Restaurar tema base
          </button>
        </div>
      ) : (
        <p className={styles.baseNote}>Usando el tema base de la app.</p>
      )}
    </div>
  )
}
