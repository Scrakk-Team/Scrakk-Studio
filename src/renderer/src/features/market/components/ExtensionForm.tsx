// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useState, type ChangeEvent, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { MARKET_MAX_SCREENSHOTS, type MarketExtension, type RepoProvider } from '@shared/market'
import { useMarket } from '../state/MarketContext'
import styles from '../market.module.css'

import { t } from '@core/i18n'
interface ExtensionFormProps {
  initial?: MarketExtension
  onDone: () => void
}

/** Form para publicar / editar una extensión (metadata + imágenes). */
export function ExtensionForm({ initial, onDone }: ExtensionFormProps): JSX.Element {
  const { save, uploadImage } = useMarket()
  const [name, setName] = useState(initial?.name ?? '')
  const [summary, setSummary] = useState(initial?.summary ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [provider, setProvider] = useState<RepoProvider>(initial?.repoProvider ?? 'github')
  const [repoUrl, setRepoUrl] = useState(initial?.repoUrl ?? '')
  const [assetName, setAssetName] = useState(initial?.assetName ?? '')
  const [categories, setCategories] = useState((initial?.categories ?? []).join(', '))
  const [license, setLicense] = useState(initial?.license ?? '')
  const [videoUrl, setVideoUrl] = useState(initial?.videoUrl ?? '')
  const [iconUrl, setIconUrl] = useState(initial?.iconUrl ?? '')
  const [screenshots, setScreenshots] = useState<string[]>(initial?.screenshots ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Guardado OK: el aviso de "queda en revisión" reemplaza al cierre mudo. */
  const [saved, setSaved] = useState(false)

  const pickImage = async (
    event: ChangeEvent<HTMLInputElement>,
    apply: (url: string) => void
  ): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const result = await uploadImage(file)
    if (result.ok) apply(result.data)
    else setError(result.error)
  }

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const result = await save({
      id: initial?.id,
      name,
      summary,
      description,
      repoProvider: provider,
      repoUrl,
      assetName,
      license,
      videoUrl,
      iconUrl,
      screenshots,
      categories: categories.split(',').map((c) => c.trim()).filter(Boolean)
    })
    setBusy(false)
    // No se cierra el form: el aviso de "queda en revisión" tiene que leerse
    // (antes se cerraba en silencio y parecía que no se había guardado/publicado).
    if (result.ok) setSaved(true)
    else setError(result.error)
  }

  return (
    <div className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>{t('market.form.nombre')}</span>
        <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{t('market.form.resumen')}</span>
        <input className={styles.input} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{t('market.form.descripcion')}</span>
        <textarea
          className={styles.textarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>{t('market.form.repo')}</span>
          <div className={styles.selectWrap}>
            <select
              className={styles.select}
              value={provider}
              onChange={(e) => setProvider(e.target.value as RepoProvider)}
            >
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
            </select>
            <ProductIcon
              id="chevron-down"
              size={12}
              className={styles.selectChevron}
              aria-hidden="true"
            />
          </div>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('market.form.repo')}</span>
          <input
            className={styles.input}
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/you/repo"
          />
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>{t('market.ultima.version')}</span>
        <input
          className={styles.input}
          value={assetName}
          onChange={(e) => setAssetName(e.target.value)}
          placeholder={t('market.asset.opcional')}
        />
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>{t('market.form.categorias')}</span>
          <input
            className={styles.input}
            value={categories}
            onChange={(e) => setCategories(e.target.value)}
            placeholder={t('market.categorias.hint')}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('market.form.licencia')}</span>
          <input className={styles.input} value={license} onChange={(e) => setLicense(e.target.value)} />
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>{t('market.form.video')}</span>
        <input className={styles.input} value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
      </label>

      <div className={styles.field}>
        <span className={styles.label}>{t('market.form.icono')}</span>
        <div className={styles.images}>
          {iconUrl ? (
            <div className={styles.image}>
              <img src={iconUrl} alt="" />
              <button
                type="button"
                className={styles.imageRemove}
                aria-label={t('common.cerrar')}
                onClick={() => setIconUrl('')}
              >
                <ProductIcon id="close" size={10} aria-hidden="true" />
              </button>
            </div>
          ) : null}
          <label className={styles.uploadTile}>
            <ProductIcon id="plus" size={16} />
            <span>{t('market.form.subir')}</span>
            <input
              type="file"
              accept="image/*"
              className={styles.hidden}
              onChange={(e) => void pickImage(e, setIconUrl)}
            />
          </label>
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>
          {t('market.form.screenshots', { max: String(MARKET_MAX_SCREENSHOTS) })}
        </span>
        <div className={styles.images}>
          {screenshots.map((src) => (
            <div key={src} className={styles.image}>
              <img src={src} alt="" />
              <button
                type="button"
                className={styles.imageRemove}
                aria-label={t('common.cerrar')}
                onClick={() => setScreenshots((prev) => prev.filter((s) => s !== src))}
              >
                <ProductIcon id="close" size={10} aria-hidden="true" />
              </button>
            </div>
          ))}
          {screenshots.length < MARKET_MAX_SCREENSHOTS ? (
            <label className={styles.uploadTile}>
              <ProductIcon id="plus" size={16} />
              <span>{t('market.form.subir')}</span>
              <input
                type="file"
                accept="image/*"
                className={styles.hidden}
                onChange={(e) =>
                  void pickImage(e, (url) => setScreenshots((prev) => [...prev, url].slice(0, MARKET_MAX_SCREENSHOTS)))
                }
              />
            </label>
          ) : null}
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {saved ? <p className={styles.notice}>{t('market.guardado.en.revision')}</p> : null}

      <div className={styles.detailActions}>
        <button type="button" className={styles.btn} disabled={busy || !name.trim()} onClick={() => void submit()}>
          {busy ? t('market.guardando') : t('market.publicar')}
        </button>
        <button type="button" className={styles.ghost} onClick={onDone}>
          {t('market.cancelar')}
        </button>
      </div>
    </div>
  )
}
