// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Consentimiento de instalación de extensiones.
 *
 * El "permissions" del manifest no es una frontera real: el host corre Node sin
 * sandbox y los bundles de UI se importan en el renderer. Instalar una
 * extensión con código es, en la práctica, ejecutar código de terceros con los
 * privilegios del usuario — y hasta ahora se hacía con un solo clic. Este
 * diálogo lo dice explícitamente y lista los permisos declarados.
 *
 * Las extensiones puramente declarativas (temas, iconos, lenguajes) no
 * ejecutan código y no lo piden.
 */

import { dialog } from 'electron'
import { t } from '@shared/i18n'

/** ¿El paquete ejecuta código (bundle de UI o runtime de host)? */
export function extensionRunsCode(manifest: Record<string, unknown>): boolean {
  if (manifest.runtime && typeof manifest.runtime === 'object') return true
  const contributes = manifest.contributes
  if (!contributes || typeof contributes !== 'object') return false
  const c = contributes as Record<string, unknown>
  return ['panels', 'activityBar', 'centerTabs'].some((key) => Array.isArray(c[key]))
}

function declaredPermissions(manifest: Record<string, unknown>): string[] {
  const raw = manifest.permissions
  return Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string') : []
}

/**
 * Pide confirmación para instalar una extensión con código. Devuelve true si el
 * usuario acepta o si el paquete es declarativo.
 */
export async function confirmExtensionInstall(
  manifest: Record<string, unknown>,
  source: 'sef' | 'market' | 'vsix'
): Promise<boolean> {
  if (!extensionRunsCode(manifest)) return true

  const name = typeof manifest.name === 'string' ? manifest.name : String(manifest.id ?? '')
  const permissions = declaredPermissions(manifest)
  const permissionList =
    permissions.length > 0 ? permissions.map((p) => `• ${p}`).join('\n') : t('main.ext.sin.permisos')

  const response = await dialog.showMessageBox({
    type: 'warning',
    title: t('main.ext.consentimiento.titulo'),
    message: t('main.ext.consentimiento.titulo'),
    detail: t('main.ext.consentimiento.mensaje', {
      name,
      source,
      permissions: permissionList
    }),
    buttons: [t('main.ext.consentimiento.instalar'), t('main.ext.consentimiento.cancelar')],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  })
  return response.response === 0
}
