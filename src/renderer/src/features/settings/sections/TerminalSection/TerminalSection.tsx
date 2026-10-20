// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sección "Terminal" — con qué fuente se dibuja la terminal.
 *
 * Por defecto sigue a la monoespaciada del sistema (y a lo que fontconfig elige
 * para cada bloque), así se ve igual que la terminal del usuario. Acá solo se
 * puede FORZAR otra familia; el valor lo resuelve el main en caliente
 * (ver `getTerminalFontFamily` / `setTerminalFontFamilyEverywhere`).
 */

import { useCallback, useEffect, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import {
  getTerminalFontFamily,
  listMonoFontFamilies,
  setTerminalFontFamilyEverywhere,
  TERMINAL_FONT_SETTING_KEY
} from '@services/innerta/terminalSession'
import styles from './TerminalSection.module.css'

import { t } from '@core/i18n'

export function TerminalSection(): JSX.Element {
  const [family, setFamily] = useState<string>(() => getTerminalFontFamily())
  const [families, setFamilies] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    void listMonoFontFamilies().then((list) => {
      if (alive) setFamilies(list)
    })
    return () => {
      alive = false
    }
  }, [])

  // Otra ventana (o el evento de storage) puede cambiar la elección.
  useEffect(() => {
    const sync = (): void => setFamily(getTerminalFontFamily())
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const handleFamily = useCallback((next: string) => {
    setFamily(next)
    setTerminalFontFamilyEverywhere(next)
  }, [])

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
        <div className={styles.selectWrap}>
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
          <ProductIcon
            id="chevron-down"
            size={12}
            className={styles.selectChevron}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  )
}

// Re-export para que el key de settings y la sesión no diverjan.
export { TERMINAL_FONT_SETTING_KEY as TERMINAL_FONT_KEY }
