// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Compartir archivos en el chat social — acción global.
 *
 * El menú contextual (Explorer y tabs) no vive dentro del panel Social, así que
 * la conversación activa se publica acá desde el `SocialContext`. Sin
 * conversación abierta, se avisa por notificación.
 */

import { notify } from '@services/notifications'
import { detectLanguageFromPath } from '@features/editor/languages'
import { baseNameOf } from '@features/explorer/utils/fileUtils'

import { t } from '@core/i18n'
import { api } from '@services/api'
export interface ActiveSocialSession {
  accountId: string
  peerId: string
  peerName: string
}

let active: ActiveSocialSession | null = null

/** Lo llama el `SocialContext` al cambiar la cuenta o el amigo activo. */
export function setActiveSocialSession(session: ActiveSocialSession | null): void {
  active = session
}

export function getActiveSocialSession(): ActiveSocialSession | null {
  return active
}

/**
 * Comparte un archivo a la conversación abierta. `content` es opcional: si no
 * viene, se lee del disco (el editor puede pasar el buffer con cambios).
 */
export async function shareFileToSocial(path: string, content?: string): Promise<void> {
  const session = active
  if (!session) {
    notify({
      title: t('social.abri.una.conversacion'),
      message: t('social.compartir.va.a.la.conversacion')
    })
    return
  }

  let text = content
  if (text === undefined) {
    const res = await api.fs.readFile(path)
    if (!res.success || typeof res.content !== 'string') {
      notify({ title: t('social.no.se.pudo.compartir'), message: res.error ?? '' })
      return
    }
    text = res.content
  }

  const name = baseNameOf(path)
  const result = await api.social.sendCodeFile(session.accountId, session.peerId, {
    name,
    lang: detectLanguageFromPath(path) ?? 'plaintext',
    content: text
  })
  if (!result.ok) {
    notify({ title: t('social.no.se.pudo.compartir'), message: result.error })
    return
  }
  notify({ title: t('social.archivo.compartido'), message: `${name} → ${session.peerName}` })
}
