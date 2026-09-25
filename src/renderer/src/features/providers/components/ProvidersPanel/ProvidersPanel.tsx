// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { ProductIcon } from '@services/productIcons/components'
import { useMemo, useState, type JSX } from 'react'
import {
  THINKING_MODE_LABELS,
  thinkingOptionsFor,
  type ThinkingMode
} from '@shared/thinking'
import { showContextMenu } from '@features/editor/engines/innerta/menuHost'
import { useProviders } from '../../state'
import styles from '../ProvidersModal/ProvidersModal.module.css'

/**
 * Panel de proveedores (sin modal): lista los proveedores DETECTADOS por el
 * registry y permite configurar API key, modelo y modo de pensamiento.
 *
 * Lo consumen dos lugares con el MISMO código: la sección "Proveedores" de
 * Ajustes (reemplaza al modal viejo) y el `ProvidersModal` (wrapper delgado).
 */
export function ProvidersPanel(): JSX.Element {
  const {
    providers,
    activeProviderId,
    getApiKey,
    getModel,
    selectProvider,
    setApiKey,
    removeApiKey,
    setModel,
    getThinkingMode,
    setThinkingMode
  } = useProviders()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [modelDraft, setModelDraft] = useState('')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return providers
    const q = search.toLowerCase()
    return providers.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    )
  }, [providers, search])

  const handleProviderClick = (providerId: string): void => {
    if (editingId) setModel(editingId, modelDraft.trim())

    setEditingId(editingId === providerId ? null : providerId)
    if (getApiKey(providerId)) selectProvider(providerId)
    setKeyDraft('')
    setModelDraft(getModel(providerId))
  }

  const handleSaveKey = (providerId: string): void => {
    if (!keyDraft.trim()) return
    setApiKey(providerId, keyDraft)
    setEditingId(null)
  }

  const handleSaveModel = (providerId: string): void => {
    setModel(providerId, modelDraft.trim())
  }

  return (
    <>
      <p className={styles.intro}>
        Elige un proveedor, pega tu API key y escribe el <strong>id del modelo</strong>.
      </p>

      <div className={styles.searchRow}>
        <ProductIcon id="search" size={14} className={styles.searchIcon} aria-hidden="true" />
        <input
          className={styles.searchInput}
          type="text"
          value={search}
          placeholder={`Buscar entre ${providers.length} proveedores…`}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Buscar proveedores"
        />
      </div>

      <ul className={styles.list}>
        {filtered.map((provider) => {
          const isActive = provider.id === activeProviderId
          const hasKey = Boolean(getApiKey(provider.id))
          const isEditing = editingId === provider.id
          return (
            <li key={provider.id}>
              <button
                type="button"
                className={styles.provider}
                aria-current={isActive ? 'true' : undefined}
                aria-expanded={isEditing ? 'true' : 'false'}
                aria-controls={isEditing ? `config-${provider.id}` : undefined}
                onClick={() => handleProviderClick(provider.id)}
              >
                <span className={styles.providerIcon} aria-hidden="true">
                  {provider.logo ? (
                    <span
                      className={styles.providerLogo}
                      style={{
                        WebkitMaskImage: `url("${provider.logo}")`,
                        maskImage: `url("${provider.logo}")`
                      }}
                    />
                  ) : (
                    <ProductIcon id="server" size={14} />
                  )}
                </span>
                <span className={styles.providerInfo}>
                  <span className={styles.providerTop}>
                    <span className={styles.providerName}>{provider.name}</span>
                    {isActive ? (
                      <span className={styles.statusActive}>Activo</span>
                    ) : hasKey ? (
                      <span className={styles.statusSaved}>Key guardada</span>
                    ) : null}
                  </span>
                  <span className={styles.providerDesc}>{provider.description}</span>
                </span>
              </button>

              {isEditing && (
                <div id={`config-${provider.id}`} className={styles.keyForm}>
                  {!hasKey && (
                    <>
                      <label className={styles.keyLabel} htmlFor={`key-${provider.id}`}>
                        API key de {provider.name}
                      </label>
                      <div className={styles.keyRow}>
                        <ProductIcon id="key" size={14} className={styles.keyIcon} aria-hidden="true" />
                        <input
                          id={`key-${provider.id}`}
                          className={styles.keyInput}
                          type="password"
                          value={keyDraft}
                          autoFocus
                          placeholder="sk-…"
                          onChange={(event) => setKeyDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') handleSaveKey(provider.id)
                          }}
                          aria-label={`API key de ${provider.name}`}
                        />
                      </div>
                      <div className={styles.keyActions}>
                        <button
                          type="button"
                          className={styles.saveBtn}
                          disabled={!keyDraft.trim()}
                          onClick={() => handleSaveKey(provider.id)}
                        >
                          Guardar y usar
                        </button>
                        <button
                          type="button"
                          className={styles.cancelBtn}
                          onClick={() => setEditingId(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </>
                  )}

                  {hasKey && (
                    <div className={styles.keyActions}>
                      <span className={styles.keySaved}>
                        Key guardada. Escribe el modelo que uses abajo.
                      </span>
                      <button
                        type="button"
                        className={styles.removeBtn}
                        onClick={() => removeApiKey(provider.id)}
                      >
                        Quitar key
                      </button>
                    </div>
                  )}

                  <label className={styles.keyLabel} htmlFor={`model-${provider.id}`}>
                    Modelo (id exacto)
                  </label>
                  <div className={styles.keyRow}>
                    <input
                      id={`model-${provider.id}`}
                      className={styles.modelInput}
                      type="text"
                      list={provider.models.length > 0 ? `models-${provider.id}` : undefined}
                      value={modelDraft}
                      placeholder={provider.defaultModel}
                      spellCheck={false}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => setModelDraft(event.target.value)}
                      onBlur={() => handleSaveModel(provider.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur()
                      }}
                      aria-label={`Modelo de ${provider.name}`}
                    />
                    {provider.models.length > 0 ? (
                      <datalist id={`models-${provider.id}`}>
                        {provider.models.map((modelId) => (
                          <option key={modelId} value={modelId} />
                        ))}
                      </datalist>
                    ) : null}
                  </div>
                  <p className={styles.hint}>
                    Sugeridos del catálogo (models.dev): {provider.models.length} modelos.
                    Puedes escribir otro id.
                  </p>

                  <label className={styles.keyLabel} htmlFor={`thinking-${provider.id}`}>
                    Modo de pensamiento
                  </label>
                  {(() => {
                    const options = thinkingOptionsFor(modelDraft)
                    const storedMode = getThinkingMode(provider.id)
                    const mode: ThinkingMode = options.includes(storedMode) ? storedMode : 'auto'
                    return (
                      <div className={styles.keyRow}>
                        <button
                          type="button"
                          className={styles.modelSelect}
                          aria-haspopup="menu"
                          aria-label={`Modo de pensamiento de ${provider.name}`}
                          onClick={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect()
                            showContextMenu(
                              rect.left,
                              rect.bottom,
                              options.map((option) => ({
                                label: THINKING_MODE_LABELS[option],
                                checked: option === mode,
                                onClick: () => setThinkingMode(provider.id, option)
                              }))
                            )
                          }}
                        >
                          <span className={styles.selectLabel}>{THINKING_MODE_LABELS[mode]}</span>
                          <ProductIcon id="chevron-down" size={12} className={styles.selectChevron} />
                        </button>
                      </div>
                    )
                  })()}
                  <p className={styles.hint}>
                    Se detecta según el modelo (o1/o3/gpt-5, Claude, Gemini, DeepSeek R1…).
                  </p>

                  <p className={styles.hint}>
                    Obtienes tu key en:{' '}
                    <span className={styles.hintUrl}>{provider.apiKeyUrl}</span>
                  </p>
                </div>
              )}
            </li>
          )
        })}
        {filtered.length === 0 && (
          <li className={styles.empty}>No se encontraron proveedores para "{search}"</li>
        )}
      </ul>
    </>
  )
}
