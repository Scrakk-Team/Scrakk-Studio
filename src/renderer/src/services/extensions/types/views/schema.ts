/**
 * Tipo 'views' — schema declarativo.
 *
 * Una VISTA es un panel aportado por una extensión que ejecuta código: el
 * contenido no viene del paquete SEF sino del Extension Host (`views` es la
 * puerta declarativa que lo hace montable en la activity bar).
 *
 * El manifest lo declara así:
 *
 *   "views": [{
 *     "id": "pub.ext.chat",          // id global de la vista (VS Code)
 *     "name": "Chat",                // título del panel
 *     "container": "pub.ext.side",   // contenedor = botón de la activity bar
 *     "containerTitle": "Mi extensión",
 *     "iconSvg": "<svg …>",          // icono del botón (inline, temático)
 *     "order": 10
 *   }]
 *
 * Varias vistas con el mismo `container` comparten botón y panel: el header
 * del panel deja elegir cuál se ve.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `welcome`: QUÉ MOSTRAR CUANDO LA VISTA ESTÁ VACÍA
 *
 * Es `contributes.viewsWelcome` del VSIX. No es decoración: cuando un árbol no
 * tiene nodos, VS Code muestra ESO (el texto y los botones que la extensión
 * declaró) y no un mensaje del IDE. Se guarda por vista, con su `when`.
 */

import type { ParseContext } from '../handler'

/** Una entrada de `viewsWelcome` (puede haber varias por vista, con `when`). */
export interface ViewWelcome {
  /** Contenido markdown-ish (lo parsea la UI: ver `compatibility/vscode/welcome`). */
  contents: string
  /** Cláusula `when` (clave de contexto). Sin ella, siempre aplica. */
  when?: string
}

export interface ViewContribution {
  /** Id global de la vista (`publisher.extension.view`). */
  id: string
  /** Nombre mostrado en el header del panel. */
  name: string
  /** Id del contenedor (`viewsContainers.activitybar[].id`). */
  container: string
  /** Título del botón/contenedor. Default: el nombre de la vista. */
  containerTitle?: string
  /** SVG inline del icono del contenedor (se pinta con `currentColor`). */
  iconSvg?: string
  /** Orden dentro de la activity bar (ascendente). */
  order?: number
  /**
   * Cláusula `when` del VSIX (claves de contexto). Si evalúa falso, la vista
   * no se muestra; si TODAS las vistas de un contenedor quedan ocultas, el
   * botón de la activity bar tampoco.
   */
  when?: string
  /** Contenido de la vista cuando está vacía (`viewsWelcome`). */
  welcome?: ViewWelcome[]
  /**
   * `visibility: 'collapsed'` del VSIX: la sección arranca PLEGADA.
   * (Una vista nunca plegada por el usuario se abre sola solo si es la
   * primera del contenedor y no pidió arrancar plegada.)
   */
  collapsed?: boolean
  /**
   * `visibility: 'hidden'` del VSIX: la vista arranca OCULTA. Scrakk todavía
   * no tiene el menú de "vistas ocultas" de VS Code para volver a mostrarla,
   * así que se respeta el arranque y se dice en el reporte de instalación.
   */
  hidden?: boolean
}

export function parseViewContributions(
  raw: unknown,
  _ctx: ParseContext
): ViewContribution[] | null {
  if (!Array.isArray(raw)) return null
  const out: ViewContribution[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const c = item as Partial<ViewContribution>
    if (
      typeof c.id !== 'string' ||
      typeof c.name !== 'string' ||
      typeof c.container !== 'string' ||
      c.id.length === 0 ||
      c.container.length === 0
    ) {
      console.warn('[extensions/views] contribución inválida descartada:', c)
      continue
    }
    out.push({
      id: c.id,
      name: c.name,
      container: c.container,
      containerTitle: typeof c.containerTitle === 'string' ? c.containerTitle : undefined,
      iconSvg: typeof c.iconSvg === 'string' ? c.iconSvg : undefined,
      order: typeof c.order === 'number' ? c.order : undefined,
      when: typeof c.when === 'string' && c.when.trim().length > 0 ? c.when : undefined,
      welcome: parseViewWelcome(c.welcome),
      collapsed: c.collapsed === true ? true : undefined,
      hidden: c.hidden === true ? true : undefined
    })
  }
  return out
}

/**
 * `welcome` del manifest SEF → entradas válidas.
 *
 * El traductor ya descartó lo que no se podía leer; acá se filtra lo que no
 * tiene contenido (una entrada vacía no reemplaza el estado vacío del IDE por
 * otro igual de mudo).
 */
function parseViewWelcome(raw: unknown): ViewWelcome[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: ViewWelcome[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Partial<ViewWelcome>
    if (typeof entry.contents !== 'string' || entry.contents.trim().length === 0) continue
    out.push({
      contents: entry.contents,
      when: typeof entry.when === 'string' && entry.when.trim().length > 0 ? entry.when : undefined
    })
  }
  return out.length > 0 ? out : undefined
}
