// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sección Apariencia — selector de temas SEF.
 *
 * CERO hardcodeo: los temas vienen del ecosistema de extensiones vía la
 * API de themes (listRegisteredThemes / activateTheme / deactivateTheme /
 * subscribeToThemes). Builtin e instaladas .sef aparecen solas al
 * registrarse; la UI se re-renderiza suscrita a ese stream.
 */

import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
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
import { SegmentedTabs } from '@ui'
import {
  getLocalePreference,
  setLocalePreference,
  useT,
  type LocalePreference
} from '@core/i18n'
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
  const t = useT()
  const author = theme.isBuiltin
    ? t('settings.scrakk')
    : (ExtensionRegistry.getExtension(theme.extensionId)?.name ?? theme.extensionId)

  return (
    <button
      type="button"
      className={[styles.card, isActive ? styles.cardActive : null]
        .filter(Boolean)
        .join(' ')}
      data-theme-id={theme.id}
      onClick={() => onActivate(theme.id)}
      title={`${theme.name} (${theme.type})`}
    >
      <span className={styles.cardName}>{theme.name}</span>
      <ThemeSwatches theme={theme} />
      <span className={styles.cardMeta}>
        <span className={[styles.badge, theme.type === 'light' ? styles.badgeLight : null]
          .filter(Boolean)
          .join(' ')}>
          {theme.type === 'light' ? t('appearance.theme.light') : t('appearance.theme.dark')}
        </span>
        <span className={styles.author}>{author}</span>
      </span>
    </button>
  )
}

export function AppearanceSection(): JSX.Element {
  const t = useT()
  const [themes, setThemes] = useState<RegisteredThemeEntry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [fallback, setFallback] = useState<FontFallbackMode>(() => getFontFallbackMode())
  const [localePref, setLocalePref] = useState<LocalePreference>(() => getLocalePreference())

  const refresh = useCallback((): void => {
    setThemes(listRegisteredThemes())
    setActiveId(getActiveThemeId())
  }, [])

  // Stream reactivo del ecosistema de temas: builtin, .sef instaladas en
  // runtime, activación y desinstalación — todo llega por aquí.
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

  const pickLocale = (preference: LocalePreference): void => {
    setLocalePreference(preference)
    setLocalePref(preference)
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

  // Scroll de la lista: es un scroller PROPIO (`.browser`, 340px). Al entrar a
  // Ajustes el modal hace `scrollTo(0)` sobre SU contenedor, así que la lista
  // quedaba en el inicio en vez de en el tema que tenés puesto. La primera vez
  // que hay lista + tema activo, se centra la card activa. Después el scroll es
  // del usuario: nada lo vuelve a mover (el orden alfabético es estable).
  const browserRef = useRef<HTMLDivElement | null>(null)
  const centeredOnActive = useRef(false)
  useEffect(() => {
    if (centeredOnActive.current) return
    const browser = browserRef.current
    if (!browser || !activeId || visibleThemes.length === 0) return
    const card = browser.querySelector<HTMLElement>(`[data-theme-id="${CSS.escape(activeId)}"]`)
    if (!card) return
    centeredOnActive.current = true
    const box = browser.getBoundingClientRect()
    const target = card.getBoundingClientRect()
    browser.scrollTop += target.top - box.top - (browser.clientHeight - target.height) / 2
  }, [activeId, visibleThemes.length])

  // El aviso menciona `.sef` en medio del texto: se parte por ese token para
  // conservar el `<code>` sin meter HTML en el catálogo.
  const [hintBefore, hintAfter] = t('appearance.hint').split('.sef')

  return (
    <div className={styles.section}>
      <div className={styles.fontBox}>
        <div className={styles.fontHead}>
          <span className={styles.fontName}>{t('appearance.language.label')}</span>
        </div>
        <SegmentedTabs
          ariaLabel={t('appearance.language.aria')}
          activeId={localePref}
          onChange={(id) => pickLocale(id as LocalePreference)}
          items={[
            { id: 'system', label: t('common.system') },
            { id: 'es', label: t('settings.espanol') },
            { id: 'en', label: t('settings.english') }
          ]}
        />
        <p className={styles.hint}>{t('appearance.language.hint')}</p>
      </div>

      <p className={styles.hint}>
        {hintBefore}
        <code>.sef</code>
        {hintAfter ?? ''}
      </p>

      {allThemes.length === 0 ? (
        <p className={styles.empty}>{t('appearance.empty')}</p>
      ) : (
        <div ref={browserRef} className={styles.browser}>
          <div className={styles.themeSearchWrap}>
            <input
              className={styles.themeSearchInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('appearance.search.placeholder')}
              aria-label={t('appearance.search.aria')}
              spellCheck={false}
            />
          </div>
          {visibleThemes.length === 0 ? (
            <p className={styles.empty}>
              {t('appearance.search.noResults', { query: query.trim() })}
            </p>
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
            <span className={styles.fontTag}>{t('appearance.font.source')}</span>
          </div>
          <p className={styles.hint}>{t('appearance.font.fallbackHint')}</p>
          <div
            className={styles.fontTabs}
            role="tablist"
            aria-label={t('appearance.font.fallbackAria')}
          >
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
                {mode === 'system' ? t('common.system') : t('common.original')}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {activeId !== null ? (
        <div className={styles.activeRow}>
          <span className={styles.activeText}>
            {t('appearance.active.prefix')}{' '}
            <strong>{themes.find((theme) => theme.id === activeId)?.name ?? activeId}</strong>
          </span>
          <button type="button" className={styles.resetBtn} onClick={handleReset}>
            {t('appearance.active.reset')}
          </button>
        </div>
      ) : (
        <p className={styles.baseNote}>{t('appearance.base.note')}</p>
      )}
    </div>
  )
}
