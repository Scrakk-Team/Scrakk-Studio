// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Ajustes → Atajos.
 *
 * Todo sale de los COMANDOS: la lista es `listKeybindings()` (título YA
 * traducido, combo efectivo, si tiene override y su combo de fábrica) y cada
 * cambio se aplica con `setCommandKeybinding`.
 *
 * La UI sigue el lenguaje de las secciones del IDE (Servidores LSP / Apariencia,
 * Skills): suma de una línea, buscador sticky, filas planas sobre la superficie
 * (sin cards) y `LoadingButton` para las acciones. El selector de esquema usa
 * `SegmentedTabs`, el mismo control de Apariencia.
 */

import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { LoadingButton, SegmentedTabs } from '@ui'
import { commandRegistry } from '@services/commands'
import { eventToCombo, formatCombo } from '@services/shortcuts'
import { notify } from '@services/notifications'
import { api } from '@services/api'
import {
  KEYMAP_PRESETS,
  KEYMAP_PRESET_IDS,
  applyKeymap,
  getActiveKeymap,
  listKeybindings,
  resetCommandKeybinding,
  setCommandKeybinding,
  type KeybindingRow,
  type KeymapPresetId
} from '@services/keybindings'
import {
  translateKeybindings,
  type TranslateKeybindingsResult
} from '@shared/compatibility/vscode/keybindings/translate'
import styles from './ShortcutsSection.module.css'

import { t } from '@core/i18n'

export function ShortcutsSection(): JSX.Element {
  const [rows, setRows] = useState<KeybindingRow[]>(() => listKeybindings())
  const [preset, setPreset] = useState<KeymapPresetId>(() => getActiveKeymap())
  const [query, setQuery] = useState('')
  const [capturing, setCapturing] = useState<string | null>(null)
  const [imported, setImported] = useState<TranslateKeybindingsResult | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback((): void => {
    setRows(listKeybindings())
    setPreset(getActiveKeymap())
  }, [])

  // El registry emite al re-registrar cualquier comando (preset, rebind, reset).
  useEffect(() => commandRegistry.subscribe(refresh), [refresh])

  // Captura: fase CAPTURE + stopPropagation para que el motor global no ejecute
  // el atajo mientras se está grabando.
  useEffect(() => {
    if (!capturing) return
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        setCapturing(null)
        return
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        setCommandKeybinding(capturing, null)
        setCapturing(null)
        refresh()
        return
      }
      const combo = eventToCombo(event)
      if (!combo) return
      setCommandKeybinding(capturing, combo)
      setCapturing(null)
      refresh()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing, refresh])

  const choosePreset = (id: KeymapPresetId): void => {
    const result = applyKeymap(id)
    refresh()
    const applied = result.applied
    notify({
      title: t('settings.atajos.preset'),
      message: `${KEYMAP_PRESETS[id].label} · ${applied}`,
      severity: 'info'
    })
  }

  const importFromVsCode = async (): Promise<void> => {
    const picked = await api.fs.pickFile()
    if (!picked.success || !picked.paths?.[0]) return
    setBusy(true)
    try {
      const file = await api.fs.readFile(picked.paths[0])
      if (!file.success || typeof file.content !== 'string') return
      setImported(translateKeybindings(file.content))
    } finally {
      setBusy(false)
    }
  }

  const applyImported = (): void => {
    if (!imported) return
    let applied = 0
    for (const binding of imported.bindings) {
      if (binding.status !== 'ok' || !binding.command || !binding.combo) continue
      if (setCommandKeybinding(binding.command, binding.combo)) applied += 1
    }
    setImported(null)
    refresh()
    notify({
      title: t('settings.atajos.aplicados'),
      message: String(applied),
      severity: 'success'
    })
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (row) =>
        row.title.toLowerCase().includes(q) ||
        row.command.toLowerCase().includes(q) ||
        (row.category ?? '').toLowerCase().includes(q)
    )
  }, [rows, query])

  return (
    <div className={styles.section}>
      <p className={styles.summary}>{t('settings.atajos.hint')}</p>

      <div className={styles.presetRow}>
        <span className={styles.presetLabel}>{t('settings.atajos.preset')}</span>
        <SegmentedTabs
          ariaLabel={t('settings.atajos.preset')}
          activeId={preset}
          items={KEYMAP_PRESET_IDS.map((id) => ({ id, label: KEYMAP_PRESETS[id].label }))}
          onChange={(id) => choosePreset(id as KeymapPresetId)}
        />
        <LoadingButton
          className={styles.importButton}
          loading={busy}
          onClick={() => void importFromVsCode()}
        >
          {t('settings.atajos.importar')}
        </LoadingButton>
      </div>

      <div className={styles.searchWrap}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder={t('settings.atajos.buscar')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {imported ? (
        <div className={styles.notice}>
          <p className={styles.summary}>{t('settings.atajos.importar.hint')}</p>
          <div className={styles.stats}>
            <span className={styles.statOk}>
              {imported.stats.ok} {t('settings.atajos.importar.ok')}
            </span>
            <span>
              {imported.stats['no-command']} {t('settings.atajos.importar.sin.comando')}
            </span>
            <span>
              {imported.stats.when} {t('settings.atajos.importar.con.condicion')}
            </span>
          </div>
          {imported.error ? <p className={styles.error}>{imported.error}</p> : null}
          <div className={styles.preview}>
            {imported.bindings
              .filter((binding) => binding.status === 'ok')
              .slice(0, 40)
              .map((binding, index) => (
                <div key={`ok-${index}`} className={styles.previewRow}>
                  <code className={styles.combo}>{formatCombo(binding.combo ?? '')}</code>
                  <span className={styles.previewMeta}>
                    {binding.command} ← {binding.sourceCommand}
                  </span>
                </div>
              ))}
            {imported.bindings
              .filter((binding) => binding.status !== 'ok')
              .slice(0, 10)
              .map((binding, index) => (
                <div key={`skip-${index}`} className={styles.previewRowSkip}>
                  <code className={styles.combo}>{binding.sourceKey || '—'}</code>
                  <span className={styles.previewMeta}>
                    {binding.sourceCommand || '—'} · {binding.reason ?? binding.status}
                  </span>
                </div>
              ))}
          </div>
          <div className={styles.rowActions}>
            <LoadingButton
              loading={false}
              disabled={imported.stats.ok === 0}
              onClick={applyImported}
            >
              {t('settings.atajos.importar.aplicar')}
            </LoadingButton>
            <LoadingButton loading={false} onClick={() => setImported(null)}>
              {t('settings.atajos.importar.cerrar')}
            </LoadingButton>
          </div>
        </div>
      ) : null}

      <div className={styles.listWrap}>
        {filtered.length === 0 ? (
          <p className={styles.empty}>{t('settings.atajos.buscar')}</p>
        ) : (
          <div className={styles.list}>
            {filtered.map((row) => {
              const isCapturing = capturing === row.command
              return (
                <div key={row.command} className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTop}>
                      <span className={styles.serverName}>{row.title}</span>
                      <code
                        className={[styles.combo, isCapturing ? styles.comboCapturing : null]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {isCapturing
                          ? t('settings.atajos.capturando')
                          : row.combo
                            ? row.display
                            : t('settings.atajos.sin.atajo')}
                      </code>
                    </div>
                    <span className={styles.rowMeta}>
                      {row.category ? `${row.category} · ` : ''}
                      {row.command}
                    </span>
                  </div>
                  <div className={styles.rowActions}>
                    <LoadingButton
                      loading={isCapturing}
                      loadingLabel={t('settings.atajos.capturando')}
                      onClick={() => setCapturing(isCapturing ? null : row.command)}
                    >
                      {t('settings.atajos.cambiar')}
                    </LoadingButton>
                    <LoadingButton
                      loading={false}
                      disabled={!row.overridden}
                      onClick={() => {
                        resetCommandKeybinding(row.command)
                        refresh()
                      }}
                    >
                      {t('settings.atajos.reiniciar')}
                    </LoadingButton>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
