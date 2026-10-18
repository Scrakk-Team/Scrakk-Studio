// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * El panel React de una extensión instalada se monta en un iframe con origen
 * scrakk-ext://<id>; el bundle y el runtime se sirven en ese origen.
 */

import { describe, it, expect } from 'vitest'
import { isolatedPanelUrl } from '../src/renderer/src/features/extensionviews/ExtensionBundlePanel'

describe('isolatedPanelUrl', () => {
  it('codifica entry y componente', () => {
    const url = isolatedPanelUrl('demo.ext', 'dist/modules.js', 'panels/Panel.tsx')
    expect(url.startsWith('scrakk-ext://demo.ext/__bundle__/host.html?')).toBe(true)
    const params = new URL(url).searchParams
    expect(params.get('entry')).toBe('dist/modules.js')
    expect(params.get('component')).toBe('panels/Panel.tsx')
  })
})
