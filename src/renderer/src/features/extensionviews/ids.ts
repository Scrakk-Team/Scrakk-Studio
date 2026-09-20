/**
 * Identidad de un panel de extensión.
 *
 * Un panel de la activity bar aportado por una extensión necesita saber QUÉ
 * vista dibujar, pero el sistema de layout monta los paneles sin props más
 * allá del `panelId` (ver `PanelHost`). Así que la identidad viaja EN el
 * propio `panelId`: es la opción que no obliga a tocar el contrato de
 * `PanelEntry` ni a meter un registry paralelo.
 *
 * Formato: `extview:<extensionId>|<viewId>`.
 * El separador es `|` porque ni los ids de extensión (`a.b-c`) ni los de
 * vista de VS Code (`pub.extension.view`) pueden contenerlo.
 */

export const VIEW_PANEL_PREFIX = 'extview:'

export function viewPanelId(extensionId: string, viewId: string): string {
  return `${VIEW_PANEL_PREFIX}${extensionId}|${viewId}`
}

/**
 * Segundo segmento del `panelId`: el CONTENEDOR de la extensión (un panel
 * puede alojar varias vistas del mismo contenedor, ver `containers.ts`).
 */
export function parseViewPanelId(
  panelId: string
): { extensionId: string; containerId: string } | null {
  if (!panelId.startsWith(VIEW_PANEL_PREFIX)) return null
  const rest = panelId.slice(VIEW_PANEL_PREFIX.length)
  const separator = rest.indexOf('|')
  if (separator <= 0 || separator === rest.length - 1) return null
  return {
    extensionId: rest.slice(0, separator),
    containerId: rest.slice(separator + 1)
  }
}

/** Id del botón de la activity bar que abre la vista de una extensión. */
export function viewButtonId(extensionId: string, containerId: string): string {
  return `extview:${extensionId}:${containerId}`
}

// ── Paneles de webview del EDITOR (`createWebviewPanel`) ──────────────────

/**
 * Prefijo de un panel de webview del editor. Se agrega al id que ya arma el
 * host (`panel:<extensionId>#<n>`), así el id de layout no puede chocar con
 * el de ninguna otra contribución.
 */
export const WEBVIEW_PANEL_PREFIX = 'extpanel:'

/** Id de layout de un panel de webview del editor. */
export function webviewPanelId(rawId: string): string {
  return `${WEBVIEW_PANEL_PREFIX}${rawId}`
}

/**
 * Id del host del panel (sin el prefijo de layout), o null si ese panel no es
 * un panel de extensión.
 */
export function parseWebviewPanelId(panelId: string): string | null {
  return panelId.startsWith(WEBVIEW_PANEL_PREFIX)
    ? panelId.slice(WEBVIEW_PANEL_PREFIX.length)
    : null
}

// ── Modo de ejecución elegido por el usuario (por extensión) ──────────────

const MODE_KEY_PREFIX = 'scrakk-studio:ext-host-mode:'

/**
 * Modo de aislamiento del host para una extensión.
 *
 * Default `strict` (deny-by-default): la elección de `compat` es del usuario
 * y se guarda por extensión. La UI de Ajustes para cambiarlo todavía no
 * existe — se lee de aquí y se puede setear a mano con
 * `setHostMode(id, 'compat')`.
 */
export function readHostMode(extensionId: string): 'strict' | 'compat' {
  try {
    const value = localStorage.getItem(MODE_KEY_PREFIX + extensionId)
    return value === 'compat' ? 'compat' : 'strict'
  } catch {
    return 'strict'
  }
}

export function setHostMode(extensionId: string, mode: 'strict' | 'compat'): void {
  try {
    localStorage.setItem(MODE_KEY_PREFIX + extensionId, mode)
  } catch {
    // Sin almacenamiento: queda en 'strict' (el default seguro).
  }
}
