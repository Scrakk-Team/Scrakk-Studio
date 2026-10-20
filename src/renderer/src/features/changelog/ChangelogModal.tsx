// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Modal de novedades: muestra TODO el changelog de la versión que acaba de
 * instalar el usuario.
 *
 * Se apoya en lo que ya existe: `WelcomePanel/changelog.ts` descubre y parsea
 * `docs/changelog/changelog-*.md` en build, y el sistema global de modales
 * (`showModal`) lo presenta. El markdown es el MISMO componente que usa la
 * bienvenida, así que se ve igual.
 *
 * Se abre UNA vez por versión: la primera vez que este perfil corre `0.1.5` (o
 * sea: al actualizar, o en la primera instalación). Al cerrarlo se marca como
 * visto con la MISMA key que usa el badge de la bienvenida.
 */

import type { JSX } from 'react'
import { Markdown } from '@features/chat/components/Markdown'
import {
  loadAnnouncement,
  markChangelogSeen,
  readSeenChangelog
} from '@features/layout/panels/WelcomePanel/changelog'
import { showModal } from '@services/modals'
import { t } from '@core/i18n'
import styles from './ChangelogModal.module.css'

/** Evita abrir dos veces el modal en un mismo arranque (StrictMode / doble efecto). */
let openedThisBoot = false

export interface ChangelogModalProps {
  version: string
  body: string
  onClose: () => void
}

export function ChangelogModal({ version, body, onClose }: ChangelogModalProps): JSX.Element {
  return (
    <div className={styles.wrap}>
      <p className={styles.lead}>{t('app.changelog.lead', { version })}</p>
      <div className={styles.body}>
        <Markdown content={body} />
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onClose}>
          {t('app.changelog.cerrar')}
        </button>
      </div>
    </div>
  )
}

/** Abre el modal con el changelog empaquetado. Devuelve si lo abrió. */
export function openChangelogModal(): boolean {
  const announcement = loadAnnouncement()
  if (!announcement || !announcement.body) return false
  const version = announcement.version

  showModal({
    title: t('app.changelog.novedades', { version }),
    size: 'xl',
    render: ({ close }) => (
      <ChangelogModal
        version={version}
        body={announcement.body}
        onClose={() => {
          markChangelogSeen(version)
          close()
        }}
      />
    ),
    onClose: () => markChangelogSeen(version)
  })
  return true
}

/**
 * En el arranque: si el changelog empaquetado es el de ESTA versión y el perfil
 * todavía no lo vio, lo muestra. Nunca en una versión distinta (un changelog
 * adelantado en dev no debe saltar como modal de actualización).
 */
export function maybeShowChangelogOnBoot(): void {
  if (openedThisBoot) return
  const announcement = loadAnnouncement()
  if (!announcement) return
  if (typeof __APP_VERSION__ !== 'string' || !__APP_VERSION__) return
  if (announcement.version !== __APP_VERSION__) return
  if (readSeenChangelog() === announcement.version) return
  if (openChangelogModal()) openedThisBoot = true
}

/** Sólo tests. */
export function resetChangelogModalForTests(): void {
  openedThisBoot = false
}
