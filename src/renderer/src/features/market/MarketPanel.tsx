// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useState, type JSX } from 'react'
import { HeaderActionButton, usePanelTitleOptional } from '@features/layout'
import { ProductIcon } from '@services/productIcons/components'
import type { MarketExtension } from '@shared/market'
import { useMarket, type MarketTab } from './state/MarketContext'
import { ExtensionCard } from './components/ExtensionCard'
import { ExtensionDetail } from './components/ExtensionDetail'
import { ExtensionForm } from './components/ExtensionForm'
import styles from './market.module.css'

import { t } from '@core/i18n'
const TABS: Array<{ id: MarketTab; key: 'market.tab.tienda' | 'market.tab.instaladas' | 'market.tab.mias' }> = [
  { id: 'store', key: 'market.tab.tienda' },
  { id: 'installed', key: 'market.tab.instaladas' },
  { id: 'mine', key: 'market.tab.mias' }
]

/** Tienda de extensiones — panel completo (browse / instaladas / mías). */
export function MarketPanel(): JSX.Element {
  const market = useMarket()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<MarketExtension | undefined>(undefined)

  // Header del panel: título + botón de volver cuando hay submode (detalle o
  // form de publicar), igual que la vista de skills del chat.
  const panelHeader = usePanelTitleOptional()
  const setHeaderActions = panelHeader?.setActions ?? null
  const setHeaderTitle = panelHeader?.setTitle ?? null

  useEffect(() => {
    if (!setHeaderTitle) return undefined
    if (formOpen) {
      setHeaderTitle(t(editing ? 'market.editar' : 'market.nueva'))
      return undefined
    }
    if (market.detail) {
      setHeaderTitle(market.detail.name)
      return undefined
    }
    setHeaderTitle(t('layout.panel.extensions'))
    return undefined
  }, [setHeaderTitle, formOpen, editing, market.detail])

  useEffect(() => {
    if (!setHeaderActions) return undefined
    setHeaderActions(() => {
      if (formOpen) {
        return (
          <HeaderActionButton
            key="market.back-form"
            id="market.back-form"
            label={t('market.mias')}
            icon="chevron-right"
            iconRotation={180}
            size="sm"
            onClick={() => {
              setFormOpen(false)
              setEditing(undefined)
            }}
          />
        )
      }
      if (market.detail) {
        return (
          <HeaderActionButton
            key="market.back-detail"
            id="market.back-detail"
            label={t('market.tab.tienda')}
            icon="chevron-right"
            iconRotation={180}
            size="sm"
            onClick={market.closeDetail}
          />
        )
      }
      return null
    })
    return () => setHeaderActions(null)
  }, [setHeaderActions, formOpen, market.detail, market.closeDetail])

  if (market.detail) {
    return (
      <div className={styles.panel}>
        <ExtensionDetail />
      </div>
    )
  }

  if (formOpen) {
    return (
      <div className={styles.panel}>
        <ExtensionForm
          initial={editing}
          onDone={() => {
            setFormOpen(false)
            setEditing(undefined)
          }}
        />
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={[styles.tab, market.tab === tab.id ? styles.tabActive : null]
                .filter(Boolean)
                .join(' ')}
              onClick={() => market.setTab(tab.id)}
            >
              {t(tab.key)}
            </button>
          ))}
        </div>

        {market.tab === 'store' ? (
          <>
            <label className={styles.searchRow}>
              <ProductIcon id="search" size={13} />
              <input
                value={market.query}
                onChange={(event) => market.setQuery(event.target.value)}
                placeholder={t('market.buscar.placeholder')}
                spellCheck={false}
              />
            </label>
            {market.categories.length > 0 ? (
              <div className={styles.categories}>
                <button
                  type="button"
                  className={[styles.chip, market.category === null ? styles.chipActive : null]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => market.setCategory(null)}
                >
                  {t('market.todas.las.categorias')}
                </button>
                {market.categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={[styles.chip, market.category === category ? styles.chipActive : null]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => market.setCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {market.error ? <p className={styles.error}>{market.error}</p> : null}

      <div className={styles.scroll}>
        {market.tab === 'store' ? <StoreList /> : null}
        {market.tab === 'installed' ? <InstalledList /> : null}
        {market.tab === 'mine' ? (
          <MineList
            onNew={() => {
              setEditing(undefined)
              setFormOpen(true)
            }}
            onEdit={(extension) => {
              setEditing(extension)
              setFormOpen(true)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

function StoreList(): JSX.Element {
  const market = useMarket()
  if (market.loading) return <p className={styles.empty}>{t('market.cargando')}</p>
  if (market.results.length === 0) return <p className={styles.empty}>{t('market.sin.resultados')}</p>
  return (
    <>
      {market.results.map((extension) => (
        <ExtensionCard key={extension.id} extension={extension} />
      ))}
    </>
  )
}

function InstalledList(): JSX.Element {
  const market = useMarket()
  if (market.installed.length === 0) return <p className={styles.empty}>{t('market.sin.resultados')}</p>
  return (
    <>
      {market.installed.map((extension) => (
        <div key={extension.id} className={styles.card}>
          <span className={[styles.cardIcon, styles.cardIconFallback].join(' ')}>
            <ProductIcon id="extensions" size={20} />
          </span>
          <span className={styles.cardInfo}>
            <span className={styles.cardName}>{extension.name}</span>
            <span className={styles.cardSummary}>
              v{extension.version}
              {extension.author ? ` · ${extension.author}` : ''}
            </span>
          </span>
          <button
            type="button"
            className={styles.ghost}
            title={t('market.eliminar')}
            onClick={() => void market.uninstall(extension.id)}
          >
            <ProductIcon id="trash" size={13} />
          </button>
        </div>
      ))}
    </>
  )
}

function MineList({
  onNew,
  onEdit
}: {
  onNew: () => void
  onEdit: (extension: MarketExtension) => void
}): JSX.Element {
  const market = useMarket()
  const statusKey = {
    draft: 'market.estado.draft',
    pending: 'market.estado.pending',
    published: 'market.estado.published',
    suspended: 'market.estado.suspended'
  } as const
  return (
    <>
      <button type="button" className={styles.btn} onClick={onNew}>
        <ProductIcon id="plus" size={13} />
        {t('market.nueva')}
      </button>
      {market.mine.length === 0 ? (
        <p className={styles.empty}>{t('market.sin.resultados')}</p>
      ) : (
        market.mine.map((extension) => (
          <div key={extension.id} className={styles.card}>
            <button
              type="button"
              className={styles.cardInfo}
              style={{ background: 'transparent', border: 'none', textAlign: 'left' }}
              onClick={() => void market.openDetail(extension)}
            >
              <span className={styles.cardName}>
                {extension.name}
                {extension.verified ? (
                  <span className={styles.verified}>
                    <ProductIcon id="verified-badge" size={12} />
                  </span>
                ) : null}
              </span>
              <span className={styles.cardSummary}>
                {t(statusKey[extension.status])}
                {extension.latestVersion ? ` · v${extension.latestVersion}` : ''}
              </span>
            </button>
            <button type="button" className={styles.ghost} onClick={() => onEdit(extension)}>
              <ProductIcon id="refresh" size={13} />
            </button>
            <button
              type="button"
              className={styles.ghost}
              title={t('market.eliminar')}
              onClick={() => void market.removeExtension(extension.slug)}
            >
              <ProductIcon id="trash" size={13} />
            </button>
          </div>
        ))
      )}
    </>
  )
}
