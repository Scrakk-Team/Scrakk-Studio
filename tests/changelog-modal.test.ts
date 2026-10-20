// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Modal de novedades: el changelog completo, una vez por versión.
 *
 * Lo que se rompe en silencio: que salte en CADA arranque (molesto) o que no
 * salte nunca (el usuario actualiza y no se entera de nada). También que use un
 * markdown distinto al de la bienvenida: es el mismo changelog, tiene que verse
 * igual.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string): string =>
  readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

const MODAL = 'src/renderer/src/features/changelog/ChangelogModal.tsx'
const APP = 'src/renderer/src/app/App.tsx'

describe('cuándo se abre', () => {
  const src = read(MODAL)

  it('sólo para la versión INSTALADA (no para un changelog adelantado)', () => {
    expect(src).toContain('announcement.version !== __APP_VERSION__')
  })

  it('una vez por versión (misma key que el badge de la bienvenida)', () => {
    expect(src).toContain('readSeenChangelog() === announcement.version')
    expect(src).toContain('markChangelogSeen(version)')
  })

  it('una sola vez por arranque', () => {
    expect(src).toContain('openedThisBoot')
  })

  it('App lo dispara después del primer paint', () => {
    expect(read(APP)).toContain('maybeShowChangelogOnBoot()')
    expect(read(APP)).toContain('setTimeout(')
  })
})

describe('comando de paleta', () => {
  const commands = read('src/renderer/src/features/changelog/commands.ts')

  it('se registra por el API de comandos, con título i18n (no hardcodeado)', () => {
    expect(commands).toContain("from '@services/commands'")
    expect(commands).toContain('commandRegistry.register({')
    // El título es una CLAVE: la paleta la resuelve al renderizar.
    expect(commands).toContain("title: 'app.changelog.ver'")
    expect(commands).toContain("category: t('app.categoria.ayuda')")
  })

  it('abre el MISMO modal y App lo registra', () => {
    expect(commands).toContain('openChangelogModal()')
    expect(read(APP)).toContain('registerChangelogCommands()')
  })
})

describe('qué muestra', () => {
  const src = read(MODAL)

  it('el changelog empaquetado COMPLETO, con el markdown de la bienvenida', () => {
    expect(src).toContain("from '@features/chat/components/Markdown'")
    expect(src).toContain('<Markdown content={body} />')
    expect(src).toContain('loadAnnouncement()')
  })

  it('usa el sistema global de modales', () => {
    expect(src).toContain("from '@services/modals'")
    expect(src).toContain('showModal({')
  })
})
