/**
 * GitDecorationsBridge — proveedor global de badges de git, siempre montado.
 *
 * Antes vivía en el GitPanel: sin el panel abierto no había proveedor y los
 * badges no aparecían aunque el toggle estuviera prendido. Aquí se registra
 * 1× (montaje en App) y lee el estado vivo del repo activo en cada llamada.
 * Respeta el flag del botón git del header del explorer.
 */

import { useEffect, type JSX } from 'react'
import {
  registerFileDecorationProvider,
  isGitDecorationsVisible
} from '@features/explorer'
import { getActiveRoot, getRepoState, gitFileDecoration, toRepoRel } from '@services/git'

export function GitDecorationsBridge(): JSX.Element | null {
  useEffect(() => {
    return registerFileDecorationProvider((absPath) => {
      if (!isGitDecorationsVisible()) return null
      const root = getActiveRoot()
      const repo = root ? getRepoState(root) : null
      if (!root || !repo) return null
      const rel = toRepoRel(root, absPath)
      if (rel === null) return null
      return gitFileDecoration(
        { staged: repo.staged, unstaged: repo.unstaged, untracked: repo.untracked },
        rel
      )
    })
  }, [])
  return null
}
