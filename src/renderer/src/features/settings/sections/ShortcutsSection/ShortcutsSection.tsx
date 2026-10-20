// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Ajustes → Atajos.
 *
 * Todo sale de los COMANDOS: la lista es `listKeybindings()` (título, combo
 * efectivo, si tiene override y su combo de fábrica), y cada cambio se aplica
 * con `setCommandKeybinding` (re-registra el comando y persiste el override).
 *
 * Dos formas de cambiar los atajos:
 *  - **Esquema**: un preset completo (Scrakk / VS Code / JetBrains).
 *  - **Cambiar** en una fila: captura la próxima combinación (Esc cancela,
 *    Supr la deja sin atajo).
 * Y una de importar: `keybindings.json` de VS Code, con **vista previa** de lo
 * que se puede traducir antes de escribir nada.
 */

import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { commandRegistry } from '@services/commands'
import { eventToCombo, formatCombo } from '@services/shortcuts'
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
  const [status, setStatus] = useState('')

  const refresh = useCallback((): void => {
    setRows(listKeybindings())
    setPreset(getActiveKeymap())
  }, [])

  // El registry emite cuando cambia cualquier comando (también al aplicar un
  // preset o al re-registrar por un rebind): la tabla se mantiene al día.
  useEffect(() => commandRegistry.subscribe(refresh), [refresh])

  // Captura de la próxima combinación. En fase CAPTURE + stopPropagation para
  // que el motor global no ejecute el atajo mientras se está grabando.
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
    applyKeymap(id)
    refresh()
    setStatus('')
  }

  const importFromVsCode = async (): Promise<void> => {
    const picked = await api.fs.pickFile()
    if (!picked.success || !picked.paths?.[0]) return
    const file = await api.fs.readFile(picked.paths[0])
    if (!file.success || typeof file.content !== 'string') return
    setImported(translateKeybindings(file.content))
    setStatus('')
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
    setStatus(`${t('settings.atajos.aplicados')} (${applied})`)
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
      <p className={styles.hint}>{t('settings.atajos.hint')}</p>

      {/* ── Esquema (preset) ─────────────────────────────────────────────── */}
      <div className={styles.row}>
        <span className={styles.rowLabel}>{t('settings.atajos.preset')}</span>
        <div className={styles.chips}>
          {KEYMAP_PRESET_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={[styles.chip, preset === id ? styles.chipActive : null]
                .filter(Boolean)
                .join(' ')}
              title={KEYMAP_PRESETS[id].source}
              onClick={() => choosePreset(id)}
            >
              {KEYMAP_PRESETS[id].label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Buscar + importar ────────────────────────────────────────────── */}
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.search}
          placeholder={t('settings.atajos.buscar')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" className={styles.button} onClick={() => void importFromVsCode()}>
          {t('settings.atajos.importar')}
        </button>
      </div>

      {imported ? (
        <div className={styles.importPanel}>
          <p className={styles.importHint}>{t('settings.atajos.importar.hint')}</p>
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
          <ul className={styles.preview}>
            {imported.bindings
              .filter((binding) => binding.status === 'ok')
              .slice(0, 40)
              .map((binding, index) => (
                <li key={`${binding.sourceCommand}-${index}`} className={styles.previewRow}>
                  <span className={styles.combo}>{formatCombo(binding.combo ?? '')}</span>
                  <span className={styles.previewCommand}>{binding.command}</span>
                  <span className={styles.previewSource}>{binding.sourceKey}</span>
                </li>
              ))}
            {imported.bindings
              .filter((binding) => binding.status !== 'ok')
              .slice(0, 10)
              .map((binding, index) => (
                <li key={`skip-${index}`} className={styles.previewRowSkipped}>
                  <span className={styles.combo}>{binding.sourceKey || '—'}</span>
                  <span className={styles.previewCommand}>{binding.sourceCommand || '—'}</span>
                  <span className={styles.previewSource}>{binding.reason ?? binding.status}</span>
                </li>
              ))}
          </ul>
          <div className={styles.importActions}>
            <button
              type="button"
              className={styles.button}
              disabled={imported.stats.ok === 0}
              onClick={applyImported}
            >
              {t('settings.atajos.importar.aplicar')}
            </button>
            <button type="button" className={styles.buttonGhost} onClick={() => setImported(null)}>
              {t('settings.atajos.importar.cerrar')}
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Lista de comandos ────────────────────────────────────────────── */}
      <div className={styles.list}>
        {filtered.map((row) => {
          const isCapturing = capturing === row.command
          return (
            <div key={row.command} className={styles.item}>
              <div className={styles.itemMain}>
                <span className={styles.itemTitle}>{row.title}</span>
                <span className={styles.itemMeta}>
                  {row.category ? `${row.category} · ` : ''}
                  {row.command}
                </span>
              </div>
              <span
                className={[styles.comboBadge, isCapturing ? styles.comboCapturing : null]
                  .filter(Boolean)
                  .join(' ')}
              >
                {isCapturing
                  ? t('settings.atajos.capturando')
                  : row.combo
                    ? row.display
                    : t('settings.atajos.sin.atajo')}
              </span>
              <button
                type="button"
                className={styles.buttonSmall}
                onClick={() => setCapturing(isCapturing ? null : row.command)}
              >
                {t('settings.atajos.cambiar')}
              </button>
              <button
                type="button"
                className={styles.buttonGhostSmall}
                disabled={!row.overridden}
                onClick={() => {
                  resetCommandKeybinding(row.command)
                  refresh()
                }}
              >
                <ProductIcon id="refresh" size={11} aria-hidden="true" />
                {t('settings.atajos.reiniciar')}
              </button>
            </div>
          )
        })}
      </div>

      <p className={styles.status}>{status}</p>
    </div>
  )
}
