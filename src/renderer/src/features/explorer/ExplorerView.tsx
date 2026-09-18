/**
 * ExplorerView — la API spawneable del explorer.
 *
 * `import { ExplorerView } from '@features/explorer'` y
 * `<ExplorerView root={absPath} />` monta EL MISMO árbol del panel
 * (virtualización, lasso, iconos por tema, decoraciones) sobre una raíz
 * arbitraria, con contexto de título aislado (no toca el header ajeno).
 *
 * Toggles (misma idea que los paneles: nada hardcodeado):
 * - `interactive` (default false): menús, dnd, crear/renombrar/eliminar,
 *   botones de header y atajos de mutación. La selección, el lasso y abrir
 *   archivos siguen funcionando.
 * - `decorations` (default true): badges del registry global
 *   (registerFileDecorationProvider).
 */

import type { JSX } from 'react'
import { PanelTitleProvider } from '@features/layout'
import { ExplorerPanel } from './ExplorerPanel'
import { baseNameOf } from './utils/fileUtils'

export function ExplorerView({
  root,
  interactive = false,
  title,
  visiblePaths = null,
  onSelectionChange,
  onOpenFile
}: {
  /** Raíz absoluta a mostrar. */
  root: string | null
  /** true = explorer completo (igual que el panel). */
  interactive?: boolean
  /** Título del contexto aislado (default: nombre de la carpeta). */
  title?: string
  /** Subset a mostrar + ancestros auto-expandidos (default: todo). */
  visiblePaths?: Set<string> | null
  /** Selección actual (para acciones bulk externas). */
  onSelectionChange?: (paths: string[]) => void
  /** Hook extra al abrir un archivo (default: nada). */
  onOpenFile?: (path: string, name: string) => void
}): JSX.Element {
  return (
    <PanelTitleProvider initialTitle={title ?? (root ? baseNameOf(root) : 'Explorador')}>
      <ExplorerPanel
        rootOverride={root ?? undefined}
        interactive={interactive}
        visiblePaths={visiblePaths}
        onSelectionChange={onSelectionChange}
        onOpenFile={onOpenFile}
      />
    </PanelTitleProvider>
  )
}
