// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Consejos de la bienvenida (WelcomePanel/tips/*.json).
 *
 * Los tips guardan CLAVES i18n, no texto: acá se verifica que cada clave exista
 * en los dos idiomas del producto. Así un consejo nuevo no puede quedar con la
 * clave cruda en pantalla (el bug típico: `welcome.tip.save.title`).
 */

import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadTips } from '../src/renderer/src/features/layout/panels/WelcomePanel/tips'

function catalogValue(lang: 'es' | 'en', key: string): string | undefined {
  const dir = join(process.cwd(), 'src/shared/i18n/catalogs', lang)
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    const data = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as Record<string, string>
    if (key in data) return data[key]
  }
  return undefined
}

describe('tips de la bienvenida', () => {
  const tips = loadTips()

  it('carga los consejos desde los JSON', () => {
    expect(tips.length).toBeGreaterThanOrEqual(8)
    // Ordenados por `order` (el panel asume ese orden).
    const orders = tips.map((tip) => tip.order ?? 0)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })

  it('cada consejo tiene sus claves en es Y en (nunca texto suelto)', () => {
    for (const tip of tips) {
      expect(tip.title, tip.id).toMatch(/^welcome\.tip\..+\.title$/)
      expect(tip.description, tip.id).toMatch(/^welcome\.tip\..+\.description$/)
      for (const key of [tip.title, tip.description]) {
        expect(catalogValue('es', key), `es: ${key}`).toBeTruthy()
        expect(catalogValue('en', key), `en: ${key}`).toBeTruthy()
      }
    }
  })

  it('los comandos referenciados existen como ids del registry', () => {
    const withCommand = tips.filter((tip) => tip.command)
    expect(withCommand.length).toBeGreaterThan(0)
    for (const tip of withCommand) {
      expect(tip.command, tip.id).toMatch(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/)
    }
  })
})
