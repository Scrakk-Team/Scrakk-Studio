/**
 * GitCommandsBridge — comandos git en la paleta central.
 *
 * Vive DENTRO de LayoutProvider (usa useLayout para abrir el panel).
 * Mismo patrón que LayoutCommandsBridge: puente sin UI.
 */

import { useEffect, type JSX } from 'react'
import { useLayout } from '@features/layout'
import { commandRegistry } from '@services/commands'
import { getActiveRoot, fetchRepo, pullRepo, pushRepo } from '@services/git'

export function GitCommandsBridge(): JSX.Element | null {
  const { toggleSlotPanel } = useLayout()

  useEffect(() => {
    const openPanel = (): void => toggleSlotPanel('right', 'git')
    const unsubs = [
      commandRegistry.register({
        id: 'git.panel',
        title: 'Git: abrir panel',
        category: 'Git',
        keybinding: 'mod+shift+g',
        run: openPanel
      }),
      commandRegistry.register({
        id: 'git.fetch',
        title: 'Git: fetch --all --prune',
        category: 'Git',
        run: () => {
          const root = getActiveRoot()
          if (root) void fetchRepo(root)
        }
      }),
      commandRegistry.register({
        id: 'git.pull',
        title: 'Git: pull --ff-only',
        category: 'Git',
        run: () => {
          const root = getActiveRoot()
          if (root) void pullRepo(root)
        }
      }),
      commandRegistry.register({
        id: 'git.push',
        title: 'Git: push',
        category: 'Git',
        run: () => {
          const root = getActiveRoot()
          if (root) void pushRepo(root)
        }
      }),
      commandRegistry.register({
        id: 'git.commit',
        title: 'Git: ir a commit (abre el panel)',
        category: 'Git',
        run: openPanel
      })
    ]
    return () => unsubs.forEach((unsub) => unsub())
  }, [toggleSlotPanel])

  return null
}
