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
 *
 * La UI sigue el lenguaje del resto de Ajustes (Apariencia, Servidores): una
 * superficie única con filas planas, controles sin caja y el menú contextual
 * global para elegir — nada de <select> nativos, que traen el contorno y el
 * desplegable del sistema operativo.
 */

import { useCallback, useEffect, useState, type JSX, type MouseEvent } from 'react'
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
import { ProductIcon } from '@services/productIcons/components'
import { showContextMenu } from '@features/editor/engines/innerta/menuHost'
import { TerminalPreview } from './TerminalPreview'
import styles from './TerminalSection.module.css'

import { t } from '@core/i18n'

export function TerminalSection(): JSX.Element {
  const [family, setFamily] = useState<string>(() => getTerminalFontFamily())
  const [families, setFamilies] = useState<string[]>([])
  const [shell, setShell] = useState<string>(() => getTerminalShellChoice())
  const [shells, setShells] = useState<TerminalShellInfo | null>(null)
  const [customPath, setCustomPath] = useState<string>(() => getTerminalShellChoice())
  const [customOpen, setCustomOpen] = useState(false)
  /** Fuerza recrear la previa cuando cambia la shell (el PTY no lo hace solo). */
  const [previewEpoch, setPreviewEpoch] = useState(0)

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
  const knownShell = candidates.find((entry) => entry.id === shell)

  const fontLabel = family || t('settings.fuente.del.sistema')
  const shellLabel = customOpen
    ? customPath.trim() || t('settings.personalizada')
    : shell === ''
      ? `${t('settings.automatico')}${detected ? ` · ${detected.label}` : ''}`
      : (knownShell?.label ?? shell)

  /** Menú de fuentes: la del sistema + todas las monoespaciadas detectadas. */
  const openFontMenu = (event: MouseEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    showContextMenu(rect.left, rect.bottom, [
      {
        label: t('settings.fuente.del.sistema'),
        sublabel: t('settings.la.fuente.con.la.que.se.dibuja'),
        checked: family === '',
        onClick: () => handleFamily('')
      },
      ...families.map((name, index) => ({
        label: name,
        checked: family === name,
        separatorBefore: index === 0,
        onClick: () => handleFamily(name)
      }))
    ])
  }

  /** Menú de shells: automático, las detectadas y la ruta a mano. */
  const openShellMenu = (event: MouseEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    showContextMenu(rect.left, rect.bottom, [
      {
        label: t('settings.automatico'),
        ...(detected ? { sublabel: detected.label } : {}),
        checked: !customOpen && shell === '',
        onClick: () => {
          setCustomOpen(false)
          handleShell('')
          setPreviewEpoch((value) => value + 1)
        }
      },
      ...candidates.map((entry, index) => ({
        label: entry.label,
        sublabel: entry.path,
        checked: !customOpen && shell === entry.id,
        separatorBefore: index === 0,
        onClick: () => {
          setCustomOpen(false)
          handleShell(entry.id)
          setPreviewEpoch((value) => value + 1)
        }
      })),
      // Elección guardada que ya no está entre las detectadas (ruta antigua).
      ...(shell !== '' && !isKnown
        ? [
            {
              label: shell,
              sublabel: t('settings.personalizada'),
              checked: !customOpen,
              onClick: () => {
                setCustomOpen(false)
                handleShell(shell)
                setPreviewEpoch((value) => value + 1)
              }
            }
          ]
        : []),
      {
        label: t('settings.personalizada'),
        checked: customOpen,
        separatorBefore: true,
        onClick: () => {
          setCustomOpen(true)
          handleShell(customPath)
        }
      }
    ])
  }

  return (
    <div className={styles.section}>
      <header className={styles.head}>
        <h3>{t('settings.terminal')}</h3>
        <p>{t('settings.opciones.de.la.terminal')}</p>
      </header>

      <TerminalPreview epoch={previewEpoch} />

      <div className={styles.listWrap}>
        <div className={styles.list}>
          <div className={styles.row}>
            <div className={styles.rowInfo}>
              <span className={styles.rowName}>{t('settings.fuente.de.la.terminal')}</span>
              <span className={styles.rowMeta}>{t('settings.la.fuente.con.la.que.se.dibuja')}</span>
            </div>
            <button
              type="button"
              className={styles.control}
              aria-haspopup="menu"
              aria-label={t('settings.fuente.de.la.terminal')}
              onClick={openFontMenu}
            >
              <span className={styles.controlValue}>{fontLabel}</span>
              <ProductIcon
                id="chevron-down"
                size={12}
                className={styles.controlChevron}
                aria-hidden="true"
              />
            </button>
          </div>

          <div className={styles.row}>
            <div className={styles.rowInfo}>
              <span className={styles.rowName}>{t('settings.shell.de.la.terminal')}</span>
              <span className={styles.rowMeta}>{t('settings.con.que.shell.se.abre')}</span>
            </div>
            <button
              type="button"
              className={styles.control}
              aria-haspopup="menu"
              aria-label={t('settings.shell.de.la.terminal')}
              onClick={openShellMenu}
            >
              <span className={styles.controlValue}>{shellLabel}</span>
              <ProductIcon
                id="chevron-down"
                size={12}
                className={styles.controlChevron}
                aria-hidden="true"
              />
            </button>
          </div>

          {customOpen ? (
            <div className={styles.row}>
              <div className={styles.rowInfo}>
                <span className={styles.rowName}>{t('settings.ruta.del.ejecutable')}</span>
                <span className={styles.rowMeta}>
                  {t('settings.el.cambio.aplica.a.las.nuevas')}
                </span>
              </div>
              <input
                className={styles.input}
                value={customPath}
                placeholder="pwsh.exe"
                spellCheck={false}
                autoFocus
                onChange={(event) => {
                  setCustomPath(event.target.value)
                  handleShell(event.target.value)
                }}
                aria-label={t('settings.ruta.del.ejecutable')}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// Re-export para que el key de settings y la sesión no diverjan.
export { TERMINAL_FONT_SETTING_KEY as TERMINAL_FONT_KEY }
