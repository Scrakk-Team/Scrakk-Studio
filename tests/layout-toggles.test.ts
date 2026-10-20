// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Toggles de paneles (ToolDock / barra lateral) — la DATA de `LAYOUT_TOGGLES`.
 *
 * Acá se fijan las invariantes que evitan bugs silenciosos: ids únicos, combos
 * únicos (el motor ejecuta TODAS las acciones de un combo, así que dos toggles
 * con la misma tecla se anularían) y combinaciones válidas para el motor.
 * `git.panel` ya existe en GitCommandsBridge: no debe duplicarse.
 */

import { describe, expect, it } from 'vitest'
import { LAYOUT_TOGGLES } from '../src/renderer/src/features/layout/panelToggles'
import { parseComboSpec } from '../src/renderer/src/services/shortcuts/key'

describe('LAYOUT_TOGGLES (paneles del dock / barra lateral)', () => {
  it('cubre los paneles de la barra que faltaban', () => {
    const panelIds = LAYOUT_TOGGLES.map((toggle) => toggle.panelId)
    for (const panelId of ['chat', 'explorer', 'search', 'extensions', 'browser', 'debug', 'notes', 'social', 'tabs', 'problems']) {
      expect(panelIds).toContain(panelId)
    }
  })

  it('ids únicos y sin pisar git.panel (ya registrado por GitCommandsBridge)', () => {
    const ids = LAYOUT_TOGGLES.map((toggle) => toggle.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('layout.toggleGit')
    expect(ids).not.toContain('git.panel')
  })

  it('cada toggle tiene un combo válido y ÚNICO (dos acciones en el mismo combo se anulan)', () => {
    const combos = LAYOUT_TOGGLES.map((toggle) => {
      expect(toggle.keybinding, toggle.id).toBeTruthy()
      return parseComboSpec(toggle.keybinding ?? '').combo
    })
    expect(new Set(combos).size).toBe(combos.length)
  })

  it('los slots son de los que el layout conoce', () => {
    for (const toggle of LAYOUT_TOGGLES) {
      expect(['left', 'right', 'center', 'bottom']).toContain(toggle.slot)
    }
  })
})
