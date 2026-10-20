// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sección Legal — términos y privacidad del SERVICIO Scrakk.
 *
 * El editor es software libre (Apache-2.0); estos documentos cubren la cuenta
 * y la mensajería, que es lo único que toca servidores. Los enlaces abren en
 * el navegador del sistema (la web es la fuente de verdad).
 */

import type { JSX } from 'react'
import { LEGAL_LINKS, LEGAL_VERSION } from '@shared/legal'
import styles from './LegalSection.module.css'

import { t, type MessageKey } from '@core/i18n'
const LINKS: ReadonlyArray<{ label: MessageKey; href: string }> = [
  { label: 'settings.legal.terminos', href: LEGAL_LINKS.terms },
  { label: 'settings.legal.privacidad', href: LEGAL_LINKS.privacy },
  { label: 'settings.legal.licencia', href: LEGAL_LINKS.license }
]

export function LegalSection(): JSX.Element {
  return (
    <div className={styles.legal}>
      <p className={styles.intro}>{t('settings.legal.descripcion')}</p>
      <p className={styles.version}>{t('settings.legal.version', { version: LEGAL_VERSION })}</p>
      <ul className={styles.links}>
        {LINKS.map((link) => (
          <li key={link.href}>
            <a className={styles.link} href={link.href} target="_blank" rel="noreferrer">
              {t(link.label)}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
