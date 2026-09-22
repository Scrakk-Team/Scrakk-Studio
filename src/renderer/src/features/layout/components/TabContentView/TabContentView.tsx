import type { JSX } from 'react'
import { tabsStore, type StripId, type TabSpec } from '@features/tabs'
import { PanelHost } from '../PanelHost/PanelHost'
import { PanelTitleAutoProvider } from '../../state'
import { getPanel } from '../../registry'
import { FileTabView } from '@features/editor'
import { ExplorerView } from '@features/explorer/ExplorerView'
import { BreadcrumbsBar } from '@features/breadcrumbs'
import { LiveSessionHost } from '@features/sessions'
import { getTerminalSession } from '@services/innerta/terminalSession'

/** Título inicial del contexto de header cuando NO hay PanelFrame (strip). */
function panelTitleFor(spec: TabSpec): string {
  if (spec.kind === 'welcome') return 'Bienvenida'
  if (spec.kind === 'panel') {
    return spec.label ?? (spec.panelId ? (getPanel(spec.panelId)?.title ?? spec.panelId) : 'Panel')
  }
  return spec.label ?? ''
}

/**
 * Contenido que monta una tab (por kind):
 * - welcome / panel → PanelHost (lazy + ErrorBoundary del panel registrado).
 *   En un strip multi-tab no hay PanelFrame arriba, así que el contenido se
 *   envuelve en un PanelTitleAutoProvider: los paneles que usan usePanelTitle()
 *   (p. ej. el Explorer) no deben explotar al vivir como una tab más.
 * - file → sesión viva del archivo (multi-editor: engine por path).
 * - terminal → sesión viva de terminal (canvas + PTY que sobreviven).
 *
 * La key es el id de la tab: cada tab tiene su propio estado (un panel que
 * cambia de tab NO comparte instancia).
 */
export function TabContentView({ tab, stripId }: { tab: TabSpec; stripId?: StripId }): JSX.Element | null {
  const spec = tabsStore.getTab(tab.id) ?? tab
  // Clave de publicación del header (`stripId:tabId`) para el botón ⋯.
  const publishKey = stripId ? `${stripId}:${spec.id}` : undefined
  switch (spec.kind) {
    case 'welcome':
      return (
        <PanelTitleAutoProvider key={spec.id} initialTitle={panelTitleFor(spec)} publishKey={publishKey}>
          <PanelHost panelId="welcome" />
        </PanelTitleAutoProvider>
      )
    case 'panel':
      return (
        <PanelTitleAutoProvider key={spec.id} initialTitle={panelTitleFor(spec)} publishKey={publishKey}>
          <PanelHost panelId={spec.panelId ?? null} />
        </PanelTitleAutoProvider>
      )
    case 'file':
      return spec.filePath ? (
        <>
          <BreadcrumbsBar key={`crumbs-${spec.id}`} path={spec.filePath} />
          <FileTabView key={spec.id} filePath={spec.filePath} stripId={stripId} />
        </>
      ) : null
    case 'terminal':
      return spec.sessionId ? (
        <LiveSessionHost key={spec.id} session={getTerminalSession(spec.sessionId)} />
      ) : null
    case 'explorer':
      return spec.rootPath ? <ExplorerView key={spec.id} root={spec.rootPath} interactive /> : null
  }
}
