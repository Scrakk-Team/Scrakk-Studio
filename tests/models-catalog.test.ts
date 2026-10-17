// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * El catálogo de models.dev es JSON remoto (y el cache de disco es escribible
 * por cualquiera). Un id `__proto__` no debe tocar el prototipo de los mapas.
 */

import { describe, it, expect } from 'vitest'
import { projectCatalog } from '../src/main/models-dev/catalog'

function provider(name: string, api: string, models: Record<string, unknown> = {}) {
  return { name, api, doc: '', models }
}

describe('projectCatalog — input no confiable', () => {
  it('ignora providers peligrosos y no contamina Object.prototype', () => {
    const raw = JSON.parse(
      '{"__proto__":{"name":"evil","api":"https://evil.test","models":{"x":{"name":"x"}}},"constructor":{"name":"evil","api":"https://evil.test","models":{}},"ok":{"name":"OK","api":"https://ok.test","models":{"m":{"name":"M"}}}}'
    ) as Record<string, never>
    const catalog = projectCatalog(raw)
    expect(catalog.map((entry) => entry.id)).toEqual(['ok'])
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })

  it('ignora modelos con id peligroso y no rompe el mapa de reasoning', () => {
    const raw = JSON.parse(
      '{"p":{"name":"P","api":"https://p.test","models":{"__proto__":{"name":"x","reasoning":true},"ok":{"name":"ok","reasoning":true,"reasoning_options":[{"type":"toggle"}]}}}}'
    ) as Record<string, never>
    const [entry] = projectCatalog(raw)
    expect(entry.models).toContain('ok')
    expect(entry.models).not.toContain('__proto__')
    expect(entry.reasoning?.ok).toEqual({ toggle: true })
  })

  it('descarta providers sin api', () => {
    const catalog = projectCatalog({ p: provider('P', '', {}) })
    expect(catalog).toEqual([])
  })
})
