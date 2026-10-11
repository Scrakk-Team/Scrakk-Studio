// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { useMarket } from '../state/MarketContext'
import { Stars } from './Stars'
import styles from '../market.module.css'

import { t } from '@core/i18n'
/** Convierte un link de YouTube al embed (si aplica); si no, lo deja igual. */
function toEmbed(url: string): string {
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(url)
  return yt ? `https://www.youtube.com/embed/${yt[1]}` : url
}

/** Detalle de una extensión: install, repo, media, valoraciones. */
export function ExtensionDetail(): JSX.Element | null {
  const {
    detail,
    detailRatings,
    detailRelease,
    accountId,
    installed,
    busy,
    install,
    rate,
    report
  } = useMarket()
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  if (!detail) return null

  const mine = accountId !== null && detail.owner === accountId
  // Por ID (el slug del market == el id del paquete SEF), no por nombre: un
  // nombre cambia y dejaba el detalle creyendo que seguía instalada.
  const installedEntry = installed.find((e) => e.id.toLowerCase() === detail.slug.toLowerCase())
  const isInstalled = Boolean(installedEntry)
  // "Al día" = la versión INSTALADA es la última. Antes se comparaba el release
  // cacheado del server contra el latestVersion del server (siempre iguales), así
  // que el botón quedaba deshabilitado para cualquier cosa "instalada".
  const upToDate = isInstalled && installedEntry?.version === detail.latestVersion
  const installing = busy === `install:${detail.slug}`

  const doInstall = async (): Promise<void> => {
    setMessage(null)
    const result = await install(detail)
    setMessage(result.ok ? t('market.instalada') : result.error)
  }

  const doRate = async (): Promise<void> => {
    if (stars < 1) return
    const result = await rate(detail.slug, stars, comment)
    if (result.ok) {
      setStars(0)
      setComment('')
      setMessage(t('market.rate.titulo'))
    } else {
      setMessage(result.error)
    }
  }

  return (
    <div className={styles.detail}>
      <div className={styles.detailHead}>
        {detail.iconUrl ? (
          <img className={styles.detailIcon} src={detail.iconUrl} alt="" />
        ) : (
          <span className={[styles.detailIcon, styles.cardIconFallback].join(' ')}>
            <ProductIcon id="extensions" size={24} />
          </span>
        )}
        <div className={styles.cardInfo}>
          <span className={styles.detailTitle}>
            {detail.name}
            {detail.verified ? (
              <span className={styles.verified} title={t('market.verificado')}>
                <ProductIcon id="verified-badge" size={14} />
              </span>
            ) : null}
          </span>
          <span className={styles.detailAuthor}>
            {detail.ownerName ?? detail.ownerHandle ?? '—'}
            {detail.ownerVerified ? ` · ${t('market.autor.verificado')}` : ''}
          </span>
          <span className={styles.metaRow}>
            {detail.ratingCount > 0 ? <Stars value={detail.ratingAvg} /> : null}
            <span>{t('market.descargas', { count: String(detail.downloads) })}</span>
            {detailRelease ? (
              <span>
                {t('market.ultima.version')} v{detailRelease.version}
              </span>
            ) : null}
          </span>
        </div>
      </div>

      <div className={styles.detailActions}>
        <button
          type="button"
          className={styles.btn}
          disabled={installing || upToDate}
          onClick={() => void doInstall()}
        >
          <ProductIcon id={installing ? 'refresh' : 'download'} size={13} />
          {installing
            ? t('market.instalando')
            : isInstalled
              ? t('market.actualizar')
              : t('market.instalar')}
        </button>
        <a
          className={styles.ghost}
          href={detail.repoUrl}
          target="_blank"
          rel="noreferrer"
        >
          <ProductIcon id="globe" size={13} />
          {t('market.ver.repo')}
        </a>
        {!mine ? (
          <button
            type="button"
            className={styles.ghost}
            onClick={() => void report({ slug: detail.slug, reason: 'report' }).then(() => setMessage(t('market.reportar.enviado')))}
          >
            {t('market.reportar')}
          </button>
        ) : null}
      </div>

      {message ? <p className={styles.hint}>{message}</p> : null}

      {detail.description ? (
        <div>
          <h4 className={styles.sectionTitle}>{t('market.descripcion')}</h4>
          <p className={styles.text}>{detail.description}</p>
        </div>
      ) : null}

      {detail.screenshots.length > 0 ? (
        <div className={styles.screens}>
          {detail.screenshots.map((src) => (
            <img key={src} className={styles.screen} src={src} alt="" loading="lazy" />
          ))}
        </div>
      ) : null}

      {detail.videoUrl ? (
        <iframe
          className={styles.preview}
          src={toEmbed(detail.videoUrl)}
          title={detail.name}
          allowFullScreen
          loading="lazy"
        />
      ) : null}

      <div>
        <h4 className={styles.sectionTitle}>{t('market.permisos')}</h4>
        <p className={styles.hint}>{t('market.permisos.nota')}</p>
      </div>

      <div>
        <h4 className={styles.sectionTitle}>{t('market.valoraciones')}</h4>
        {detailRatings.length === 0 ? (
          <p className={styles.hint}>{t('market.sin.valoraciones')}</p>
        ) : (
          detailRatings.map((r) => (
            <div key={r.id} className={styles.ratingItem}>
              {r.userAvatar ? (
                <img className={styles.ratingAvatar} src={r.userAvatar} alt="" />
              ) : (
                <span className={styles.ratingAvatar} />
              )}
              <div className={styles.ratingBody}>
                <span className={styles.ratingHead}>
                  <span className={styles.ratingName}>
                    {r.userName ?? r.userHandle ?? '—'}
                  </span>
                  <Stars value={r.stars} />
                </span>
                {r.comment ? <span className={styles.text}>{r.comment}</span> : null}
              </div>
            </div>
          ))
        )}

        {accountId && !mine ? (
          <div className={styles.field}>
            <span className={styles.label}>{t('market.rate.titulo')}</span>
            <Stars value={stars} onRate={setStars} />
            <textarea
              className={styles.textarea}
              placeholder={t('market.comentario.placeholder')}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
            <button
              type="button"
              className={styles.btn}
              disabled={stars < 1}
              onClick={() => void doRate()}
            >
              {t('market.rate.enviar')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
