import { ProductIcon } from '@services/productIcons/components'
import { useMemo, useState, type JSX } from 'react'
import {
  THINKING_MODE_LABELS,
  thinkingOptionsFor,
  type ThinkingMode
} from '@shared/thinking'
import { Modal } from '@ui'
import { useProviders } from '../../state'
import styles from './ProvidersModal.module.css'

interface ProvidersModalProps {
  open: boolean
  onClose: () => void
}

/**
 * Modal de proveedores: lista los proveedores DETECTADOS por el registry
 * (cada carpeta `services/providers/<id>/index.ts`). Clickear uno expande su
 * configuración: API key (si falta) y el id del modelo, que se ESCRIBE a mano
 * — así funciona el endpoint OpenAI-compatible: `"model": "<id>"` en el body.
 */
export function ProvidersModal({ open, onClose }: ProvidersModalProps): JSX.Element {
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

  const handleClose = (): void => {
    if (editingId) setModel(editingId, modelDraft.trim())
    setSearch('')
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Proveedores">
      <p className={styles.intro}>
        Elegí un proveedor, pegá tu API key y escribí el <strong>id del modelo</strong>.
      </p>

      <div className={styles.searchRow}>
        <ProductIcon id="search" size={14} className={styles.searchIcon} aria-hidden="true" />
        <input
          className={styles.searchInput}
          type="text"
          value={search}
          placeholder={`Buscar entre ${providers.length} proveedores…`}
          autoFocus
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
                  <ProductIcon id="server" size={14} />
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
                        Key guardada. Escribí el modelo que uses abajo.
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
                  </div>
                  <p className={styles.hint}>
                    El id tal como lo espera el proveedor: <code className={styles.code}>gpt-4o</code>,{' '}
                    <code className={styles.code}>openrouter/auto</code>,{' '}
                    <code className={styles.code}>claude-3-5-sonnet</code>…
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
                        <select
                          id={`thinking-${provider.id}`}
                          className={styles.modelSelect}
                          value={mode}
                          onChange={(event) =>
                            setThinkingMode(provider.id, event.target.value as ThinkingMode)
                          }
                          aria-label={`Modo de pensamiento de ${provider.name}`}
                        >
                          {options.map((option) => (
                            <option key={option} value={option}>
                              {THINKING_MODE_LABELS[option]}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  })()}
                  <p className={styles.hint}>
                    Se detecta según el modelo (o1/o3/gpt-5, Claude, Gemini, DeepSeek R1…).
                  </p>

                  <p className={styles.hint}>
                    Conseguís tu key en:{' '}
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
    </Modal>
  )
}
