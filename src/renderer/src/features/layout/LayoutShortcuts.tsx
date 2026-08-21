/**
 * Atajos globales del layout — se montan dentro del LayoutProvider.
 *
 * Combinaciones comunes (estilo VS Code):
 *   - Ctrl/Cmd+B   → alterna el explorador (slot izquierdo)
 *   - Ctrl/Cmd+J   → alterna el chat (slot derecho)
 */

import type { JSX } from 'react'
import { useShortcut } from '@services/shortcuts'
import { useLayout } from './state'

export function LayoutShortcuts(): JSX.Element | null {
  const { toggleSlotPanel } = useLayout()

  useShortcut('mod+b', () => toggleSlotPanel('left', 'explorer'), {
    id: 'layout:toggle-explorer',
    description: 'Alternar panel del explorador',
    preventDefault: true
  })

  useShortcut('mod+j', () => toggleSlotPanel('right', 'chat'), {
    id: 'layout:toggle-chat',
    description: 'Alternar panel de chat',
    preventDefault: true
  })

  return null
}
