// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Cuerpo del modal de `notes`: la acción + la nota y la salida de la API.
 */

import type { JSX } from 'react'
import {
  ToolModalEmpty,
  ToolModalMeta,
  ToolModalSection,
  ToolModalText,
  type ToolModalContext
} from '@services/ai/tool-shell'

export function NotesModal({ args, result, status }: ToolModalContext): JSX.Element {
  const running = status === 'running' || status === 'streaming' || status === 'pending'
  const action = typeof args.action === 'string' && args.action ? args.action : '—'
  const id = typeof args.id === 'string' ? args.id : ''
  const scope = typeof args.scope === 'string' ? args.scope : ''

  const items = [{ label: 'Action', value: action }]
  if (id) items.push({ label: 'Note', value: id })
  if (scope) items.push({ label: 'Scope', value: scope })

  return (
    <>
      <ToolModalMeta items={items} />
      <ToolModalSection>
        {result ? (
          <ToolModalText>{result}</ToolModalText>
        ) : (
          <ToolModalEmpty>{running ? 'Running…' : 'No output'}</ToolModalEmpty>
        )}
      </ToolModalSection>
    </>
  )
}
