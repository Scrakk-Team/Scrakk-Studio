// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Editar una extensión publicada.
 *
 * El form de publicar y el de editar son EL MISMO (`save({ id })` hace update).
 * Lo que se rompe en silencio es el camino para llegar: sin un botón visible en
 * la ficha, cambiar el icono o una screenshot obliga a borrar y volver a crear.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string): string =>
  readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

const PANEL = 'src/renderer/src/features/market/MarketPanel.tsx'
const DETAIL = 'src/renderer/src/features/market/components/ExtensionDetail.tsx'
const CONTEXT = 'src/renderer/src/features/market/state/MarketContext.tsx'

describe('editar desde la ficha', () => {
  it('la ficha de una extensión propia ofrece editar', () => {
    const src = read(DETAIL)
    expect(src).toContain('openEditor(detail)')
    expect(src).toContain("t('market.editar')")
    expect(src).toContain('id="pencil"')
  })

  it('el form se muestra ANTES que el detalle (se abre encima)', () => {
    const src = read(PANEL)
    const form = src.indexOf('if (formOpen)')
    const detail = src.indexOf('if (market.detail)')
    expect(form).toBeGreaterThan(-1)
    expect(detail).toBeGreaterThan(-1)
    expect(form).toBeLessThan(detail)
  })

  it('el estado del editor vive en el contexto', () => {
    const src = read(CONTEXT)
    expect(src).toContain('openEditor: (extension?: MarketExtension) => void')
    expect(src).toContain('closeEditor: () => void')
    expect(src).toContain('const [editorOpen, setEditorOpen] = useState(false)')
  })
})
