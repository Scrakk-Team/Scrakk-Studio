// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Icons de tools de IA: cada tool registrada resuelve a un proicon real
 * (sin fallback silencioso al icono de archivo) y cada id del mapa existe
 * en el registry de productIcons.
 */

import { describe, it, expect } from 'vitest'
import '../src/renderer/src/services/ai/tools/index'
import { registry } from '../src/renderer/src/services/ai/tools/registry'
import { TOOL_PRODUCT_ICON_IDS } from '../src/renderer/src/services/ai/tool-shell/ToolCallIcon'
import { resolveProductIcon } from '../src/renderer/src/services/productIcons'

const EXPECTED_TOOLS = [
  'read_file',
  'read_multiple_files',
  'write_file',
  'append_file',
  'replace_in_file',
  'delete_file',
  'move_file',
  'list_directory',
  'file_search',
  'grep_search',
  'execute_command',
  'get_diagnostics',
  'history_title',
  'web_search',
  'web_fetch',
  'list_skills',
  'skill',
  'lsp',
  'multiple_tools',
  'create_app_blueprint',
  'adjust_timeout'
]

describe('tool icons', () => {
  it('todas las tools registradas tienen entrada en el mapa', () => {
    for (const name of EXPECTED_TOOLS) {
      expect(registry.has(name), `tool registrada: ${name}`).toBe(true)
      expect(TOOL_PRODUCT_ICON_IDS[name], `mapa para: ${name}`).toBeDefined()
    }
  })

  it('cada id del mapa resuelve a icono real (nada cae a fallback)', () => {
    for (const [tool, id] of Object.entries(TOOL_PRODUCT_ICON_IDS)) {
      const resolved = resolveProductIcon(id)
      expect(resolved, `${tool} -> ${id}`).not.toBeNull()
    }
  })

  it('meta.icon de cada tool es un id canónico válido', () => {
    for (const name of EXPECTED_TOOLS) {
      const meta = registry.get(name)?.meta
      expect(meta?.icon, `meta.icon de ${name}`).toBeDefined()
      const resolved = resolveProductIcon(meta!.icon!)
      expect(resolved, `meta.icon ${name} -> ${meta!.icon}`).not.toBeNull()
    }
  })
})
