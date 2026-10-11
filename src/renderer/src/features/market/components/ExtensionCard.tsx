// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import type { MarketExtension } from '@shared/market'
import { useMarket } from '../state/MarketContext'
import styles from '../market.module.css'

import { t } from '@core/i18n'
/** Tarjeta de una extensión en la tienda / mis extensiones. */
export function ExtensionCard({ extension }: { extension: MarketExtension }): JSX.Element {
  const { openDetail, mine } = useMarket()
  const isMine = mine.some((m) => m.id === extension.id)
  return (
    <button type="button" className={styles.card} onClick={() => void openDetail(extension)}>
      {extension.iconUrl ? (
        <img className={styles.cardIcon} src={extension.iconUrl} alt="" loading="lazy" />
      ) : (
        <span className={[styles.cardIcon, styles.cardIconFallback].join(' ')}>
          <ProductIcon id="extensions" size={20} />
        </span>
      )}
      <span className={styles.cardInfo}>
        <span className={styles.cardName}>
          {extension.name}
          {extension.verified ? (
            <span className={styles.verified} title={t('market.verificado')}>
              <ProductIcon id="shield-check" size={12} />
            </span>
          ) : null}
          {isMine ? <span className={styles.cardMeta}>· {t('market.mias')}</span> : null}
        </span>
        <span className={styles.cardSummary}>
          {extension.summary ?? extension.repoUrl}
        </span>
      </span>
      <span className={styles.cardMeta}>
        {extension.ratingCount > 0 ? <span>★ {extension.ratingAvg.toFixed(1)}</span> : null}
        <span>{t('market.descargas', { count: String(extension.downloads) })}</span>
      </span>
    </button>
  )
}
