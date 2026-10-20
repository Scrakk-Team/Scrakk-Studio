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

import { useCallback, useEffect, useRef, useState, type JSX, type MouseEvent } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { showContextMenu } from '@features/editor/engines/innerta/menuHost'
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

type ThemeSort = 'creator' | 'version' | 'name'

interface ThemeCardProps {
  theme: RegisteredThemeEntry
  isActive: boolean
  onActivate: (id: string) => void
}

function ThemeSwatches({ theme }: { theme: RegisteredThemeEntry }): JSX.Element {
  const colors = theme.definition.colors
  const c0 = colors.accent ?? '#888'
  const c1 = colors.editorBg ?? colors.surface ?? '#222'
  const c2 = colors.bg ?? '#000'
  // Zonas con meseta y transiciones anchas: los tres colores se reconocen, pero
  // las uniones se desvanecen en vez de cortarse con un borde duro.
  const gradient = `linear-gradient(90deg,
    ${c0} 0%,
    ${c0} 14%,
    ${c1} 40%,
    ${c1} 60%,
    ${c2} 86%,
    ${c2} 100%)`
  return (
    <div
      className={styles.swatches}
      style={{ background: gradient }}
      aria-hidden="true"
    />
  )
}

function ThemeCard({ theme, isActive, onActivate }: ThemeCardProps): JSX.Element {
  const t = useT()
  const extension = theme.isBuiltin ? null : ExtensionRegistry.getExtension(theme.extensionId)
  const extensionName = theme.isBuiltin
    ? t('settings.scrakk')
    : (extension?.name ?? theme.extensionId)
  const author = theme.isBuiltin
    ? t('settings.scrakk')
    : (extension?.author?.trim() || extensionName)

  return (
    <button
      type="button"
      className={[styles.card, isActive ? styles.cardActive : null]
        .filter(Boolean)
        .join(' ')}
      data-theme-id={theme.id}
      onClick={() => onActivate(theme.id)}
      title={`${theme.name} · ${extensionName} (${theme.type})`}
    >
      <span className={styles.cardName}>{theme.name}</span>
      <span className={styles.cardSource}>{extensionName}</span>
      <ThemeSwatches theme={theme} />
      <span className={styles.cardMeta}>
        <span className={[styles.badge, theme.type === 'light' ? styles.badgeLight : null]
          .filter(Boolean)
          .join(' ')}>
          {theme.type === 'light' ? t('appearance.theme.light') : t('appearance.theme.dark')}
        </span>
        {author !== extensionName ? <span className={styles.author}>{author}</span> : null}
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
  const [creator, setCreator] = useState<string>('all')
  const [extensionFilter, setExtensionFilter] = useState<string>('all')
  const [sort, setSort] = useState<ThemeSort>('name')

  const creatorOf = (theme: RegisteredThemeEntry): { key: string; label: string } => {
    if (theme.isBuiltin) return { key: 'scrakk', label: t('settings.scrakk') }
    const extension = ExtensionRegistry.getExtension(theme.extensionId)
    const label = extension?.author?.trim() || extension?.name || theme.extensionId
    return { key: label.toLocaleLowerCase(), label }
  }

  const extensionOf = (theme: RegisteredThemeEntry): { key: string; label: string } => {
    if (theme.isBuiltin) return { key: 'scrakk', label: t('settings.scrakk') }
    const extension = ExtensionRegistry.getExtension(theme.extensionId)
    return { key: theme.extensionId, label: extension?.name ?? theme.extensionId }
  }

  const versionOf = (theme: RegisteredThemeEntry): string =>
    ExtensionRegistry.getExtension(theme.extensionId)?.version ?? ''

  const creatorMap = new Map<string, { key: string; label: string; count: number }>()
  for (const theme of allThemes) {
    const creatorInfo = creatorOf(theme)
    const entry = creatorMap.get(creatorInfo.key)
    if (entry) entry.count += 1
    else creatorMap.set(creatorInfo.key, { ...creatorInfo, count: 1 })
  }
  const creators = [...creatorMap.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
  )

  const extensionMap = new Map<string, { key: string; label: string; count: number }>()
  for (const theme of allThemes) {
    const extensionInfo = extensionOf(theme)
    const entry = extensionMap.get(extensionInfo.key)
    if (entry) entry.count += 1
    else extensionMap.set(extensionInfo.key, { ...extensionInfo, count: 1 })
  }
  const extensions = [...extensionMap.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
  )

  useEffect(() => {
    if (creator !== 'all' && !creators.some((entry) => entry.key === creator)) {
      setCreator('all')
    }
  }, [creator, creators])

  useEffect(() => {
    if (extensionFilter !== 'all' && !extensions.some((entry) => entry.key === extensionFilter)) {
      setExtensionFilter('all')
    }
  }, [extensionFilter, extensions])

  const q = query.trim().toLowerCase()
  const filteredThemes = allThemes.filter((theme) => {
    if (creator !== 'all' && creatorOf(theme).key !== creator) return false
    if (extensionFilter !== 'all' && extensionOf(theme).key !== extensionFilter) return false
    if (!q) return true
    const creatorLabel = creatorOf(theme).label
    const extensionLabel = extensionOf(theme).label
    return [theme.name, theme.id, theme.type, creatorLabel, extensionLabel].some((field) =>
      field.toLowerCase().includes(q)
    )
  })

  const visibleThemes = [...filteredThemes].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    if (sort === 'creator') {
      const byCreator = creatorOf(a).label.localeCompare(creatorOf(b).label, undefined, {
        sensitivity: 'base'
      })
      return byCreator || byName
    }
    if (sort === 'version') {
      const byVersion = versionOf(b).localeCompare(versionOf(a), undefined, {
        numeric: true,
        sensitivity: 'base'
      })
      return byVersion || byName
    }
    return byName
  })

  const creatorLabel =
    creator === 'all'
      ? t('appearance.filter.all')
      : (creators.find((entry) => entry.key === creator)?.label ?? creator)
  const extensionFilterLabel =
    extensionFilter === 'all'
      ? t('appearance.filter.all.extensions')
      : (extensions.find((entry) => entry.key === extensionFilter)?.label ?? extensionFilter)
  const sortLabel =
    sort === 'creator'
      ? t('appearance.sort.creator')
      : sort === 'version'
        ? t('appearance.sort.version')
        : t('appearance.sort.name')

  const openCreatorMenu = (event: MouseEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    showContextMenu(rect.left, rect.bottom, [
      {
        label: t('appearance.filter.all'),
        checked: creator === 'all',
        onClick: () => setCreator('all')
      },
      ...creators.map((entry) => ({
        label: entry.label,
        shortcut: String(entry.count),
        checked: creator === entry.key,
        onClick: () => setCreator(entry.key)
      }))
    ])
  }

  const openExtensionMenu = (event: MouseEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    showContextMenu(rect.left, rect.bottom, [
      {
        label: t('appearance.filter.all.extensions'),
        checked: extensionFilter === 'all',
        onClick: () => setExtensionFilter('all')
      },
      ...extensions.map((entry) => ({
        label: entry.label,
        shortcut: String(entry.count),
        checked: extensionFilter === entry.key,
        onClick: () => setExtensionFilter(entry.key)
      }))
    ])
  }

  const openSortMenu = (event: MouseEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    showContextMenu(rect.left, rect.bottom, [
      {
        label: t('appearance.sort.creator'),
        checked: sort === 'creator',
        onClick: () => setSort('creator')
      },
      {
        label: t('appearance.sort.version'),
        checked: sort === 'version',
        onClick: () => setSort('version')
      },
      {
        label: t('appearance.sort.name'),
        checked: sort === 'name',
        onClick: () => setSort('name')
      }
    ])
  }

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
            <div className={styles.controlsRow}>
              <button
                type="button"
                className={styles.controlButton}
                aria-haspopup="menu"
                onClick={openCreatorMenu}
              >
                <span className={styles.controlLabel}>{t('appearance.filter.creator')}</span>
                <span className={styles.controlValue}>{creatorLabel}</span>
                <ProductIcon
                  id="chevron-down"
                  size={12}
                  className={styles.controlChevron}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                className={styles.controlButton}
                aria-haspopup="menu"
                onClick={openExtensionMenu}
              >
                <span className={styles.controlLabel}>{t('appearance.filter.extension')}</span>
                <span className={styles.controlValue}>{extensionFilterLabel}</span>
                <ProductIcon
                  id="chevron-down"
                  size={12}
                  className={styles.controlChevron}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                className={styles.controlButton}
                aria-haspopup="menu"
                onClick={openSortMenu}
              >
                <span className={styles.controlLabel}>{t('appearance.sort.label')}</span>
                <span className={styles.controlValue}>{sortLabel}</span>
                <ProductIcon
                  id="chevron-down"
                  size={12}
                  className={styles.controlChevron}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
          {visibleThemes.length === 0 ? (
            <p className={styles.empty}>
              {q
                ? t('appearance.search.noResults', { query: query.trim() })
                : t('appearance.filter.empty')}
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
