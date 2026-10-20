// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Comando de paleta para abrir el changelog a mano.
 *
 * Va por el registry de comandos (el mismo que usa todo el IDE), así aparece en
 * la paleta sin ningún botón escondido, y **el título es una clave i18n**: el
 * registry la resuelve al renderizar (`msg`), así que cambia con el idioma.
 * El contenido sale del changelog empaquetado — nada hardcodeado.
 */

import { commandRegistry } from '@services/commands'
import { t } from '@core/i18n'
import { openChangelogModal } from './ChangelogModal'

/** Id en la paleta. */
export const CHANGELOG_COMMAND_ID = 'app.changelog.abrir'

let registered = false

export function registerChangelogCommands(): void {
  if (registered) return
  registered = true
  commandRegistry.register({
    id: CHANGELOG_COMMAND_ID,
    // Clave, no texto: la paleta la traduce al abrir.
    title: 'app.changelog.ver',
    category: t('app.categoria.ayuda'),
    run: () => {
      // Abre el MISMO modal que el arranque (y lo re-marca como visto).
      openChangelogModal()
    }
  })
}

/** Sólo tests. */
export function resetChangelogCommandsForTests(): void {
  commandRegistry.unregister(CHANGELOG_COMMAND_ID)
  registered = false
}
