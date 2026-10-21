// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sección "Terminal" — con qué fuente se dibuja la terminal y con qué shell
 * se abre.
 *
 * Por defecto, la fuente sigue a la del sistema (la que fontconfig elige para
 * cada bloque), así se ve igual que la terminal del usuario; y la shell también
 * es la del sistema: el main detecta cuál es (en Windows, el perfil por
 * defecto de Windows Terminal; si no hay, `pwsh`/`powershell`/`cmd`) y la usa.
 *
 * Acá se puede FORZAR cualquiera de los dos. Del shell sólo se ofrecen las que
 * EXISTEN en la máquina: las detecta el main (perfiles de Windows Terminal, el
 * PATH y las rutas conocidas).
 */

import { useCallback, useEffect, useState, type JSX } from 'react'
import type { TerminalShellInfo } from '@shared/terminal'
import {
  getTerminalFontFamily,
  getTerminalShellChoice,
  listMonoFontFamilies,
  listTerminalShells,
  setTerminalFontFamilyEverywhere,
  setTerminalShellChoice,
  TERMINAL_FONT_SETTING_KEY
} from '@services/innerta/terminalSession'
import styles from './TerminalSection.module.css'

import { t } from '@core/i18n'

/** Valor del <select> para "ruta a mano". */
const CUSTOM = '__custom__'

export function TerminalSection(): JSX.Element {
  const [family, setFamily] = useState<string>(() => getTerminalFontFamily())
  const [families, setFamilies] = useState<string[]>([])
  const [shell, setShell] = useState<string>(() => getTerminalShellChoice())
  const [shells, setShells] = useState<TerminalShellInfo | null>(null)
  const [customPath, setCustomPath] = useState<string>(() => getTerminalShellChoice())
  const [customOpen, setCustomOpen] = useState(false)

  useEffect(() => {
    let alive = true
    void listMonoFontFamilies().then((list) => {
      if (alive) setFamilies(list)
    })
    void listTerminalShells().then((info) => {
      if (alive) setShells(info)
    })
    return () => {
      alive = false
    }
  }, [])

  // Otra ventana (o el evento de storage) puede cambiar la elección.
  useEffect(() => {
    const sync = (): void => {
      setFamily(getTerminalFontFamily())
      setShell(getTerminalShellChoice())
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const handleFamily = useCallback((next: string) => {
    setFamily(next)
    setTerminalFontFamilyEverywhere(next)
  }, [])

  const handleShell = useCallback((next: string) => {
    setShell(next)
    setTerminalShellChoice(next)
  }, [])

  const candidates = shells?.candidates ?? []
  const detected = shells?.detected
  // La elección guardada puede ser una ruta a mano: no está en las candidatas.
  const isKnown = candidates.some((entry) => entry.id === shell)

  return (
    <div className={styles.section}>
      <div className={styles.headerText}>
        <h3>{t('settings.terminal')}</h3>
        <p>{t('settings.opciones.de.la.terminal')}</p>
      </div>

      <div className={styles.row}>
        <div className={styles.rowInfo}>
          <span className={styles.rowName}>{t('settings.fuente.de.la.terminal')}</span>
          <span className={styles.rowMeta}>{t('settings.la.fuente.con.la.que.se.dibuja')}</span>
        </div>
        <select
          className={styles.select}
          value={family}
          onChange={(event) => handleFamily(event.target.value)}
          aria-label={t('settings.fuente.de.la.terminal')}
        >
          <option value="">{t('settings.fuente.del.sistema')}</option>
          {families.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.row}>
        <div className={styles.rowInfo}>
          <span className={styles.rowName}>{t('settings.shell.de.la.terminal')}</span>
          <span className={styles.rowMeta}>{t('settings.con.que.shell.se.abre')}</span>
        </div>
        <select
          className={styles.select}
          value={customOpen ? CUSTOM : shell}
          onChange={(event) => {
            const value = event.target.value
            if (value === CUSTOM) {
              setCustomOpen(true)
              return
            }
            setCustomOpen(false)
            handleShell(value)
          }}
          aria-label={t('settings.shell.de.la.terminal')}
        >
          <option value="">
            {t('settings.automatico')}
            {detected ? ` · ${detected.label}` : ''}
          </option>
          {candidates.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
          {shell !== '' && !isKnown && (
            <option value={shell}>{shell}</option>
          )}
          <option value={CUSTOM}>{t('settings.personalizada')}</option>
        </select>
      </div>

      {customOpen && (
        <div className={styles.row}>
          <div className={styles.rowInfo}>
            <span className={styles.rowName}>{t('settings.ruta.del.ejecutable')}</span>
            <span className={styles.rowMeta}>{t('settings.el.cambio.aplica.a.las.nuevas')}</span>
          </div>
          <input
            className={styles.input}
            value={customPath}
            placeholder="pwsh.exe"
            spellCheck={false}
            onChange={(event) => {
              setCustomPath(event.target.value)
              handleShell(event.target.value)
            }}
            aria-label={t('settings.ruta.del.ejecutable')}
          />
        </div>
      )}
    </div>
  )
}

// Re-export para que el key de settings y la sesión no diverjan.
export { TERMINAL_FONT_SETTING_KEY as TERMINAL_FONT_KEY }
