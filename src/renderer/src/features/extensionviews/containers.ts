/**
 * Registro contenedor → vistas de extensiones.
 *
 * Un CONTENEDOR es el botón de la activity bar; adentro puede haber varias
 * vistas (VS Code las apila en un accordion). El panel del contenedor
 * consulta este mapa para ofrecer cuál mostrar.
 *
 * Vive en la feature (y sin React) por dos razones: el panel lo lee, y el
 * boot de extensiones lo escribe — así no se cruzan los grafos de imports.
 */

import { evaluateWhen } from '@services/extensions/when'

export interface ContainerWelcome {
  /** Contenido declarado por la extensión (`viewsWelcome`). */
  contents: string
  /** Cláusula `when` (`false` = esa entrada no aplica). */
  when?: string
}

export interface ContainerView {
  /** Id global de la vista (`publisher.extension.view`). */
  id: string
  /** Nombre mostrado. */
  name: string
  /** Cláusula `when` declarada por la extensión (contexto). */
  when?: string
  /**
   * Qué mostrar cuando la vista está VACÍA (`viewsWelcome`). Sin esto, un
   * árbol sin nodos cae en el mensaje propio del IDE.
   */
  welcome?: ContainerWelcome[]
  /** `visibility: 'collapsed'`: la sección arranca plegada. */
  collapsed?: boolean
  /**
   * `visibility: 'hidden'`: la vista arranca oculta (no se muestra). Scrakk no
   * tiene todavía el menú de vistas ocultas de VS Code, así que una vista
   * oculta no se puede volver a mostrar desde la UI.
   */
  hidden?: boolean
}

export interface ContainerEntry {
  extensionId: string
  containerId: string
  title: string
  order: number
  iconSvg: string
  views: ContainerView[]
}

/** `${extensionId}|${containerId}` → contenedor. */
const containers = new Map<string, ContainerEntry>()

function key(extensionId: string, containerId: string): string {
  return `${extensionId}|${containerId}`
}

export function hasContainer(extensionId: string, containerId: string): boolean {
  return containers.has(key(extensionId, containerId))
}

export function getContainer(
  extensionId: string,
  containerId: string
): ContainerEntry | undefined {
  return containers.get(key(extensionId, containerId))
}

export function getContainerViews(extensionId: string, containerId: string): ContainerView[] {
  return containers.get(key(extensionId, containerId))?.views ?? []
}

/** Una vista puntual de un contenedor (para el contenido de vista vacía). */
export function getContainerView(
  extensionId: string,
  containerId: string,
  viewId: string
): ContainerView | undefined {
  return getContainerViews(extensionId, containerId).find((view) => view.id === viewId)
}

export interface ContainerSeed {
  containerId: string
  containerTitle?: string
  iconSvg: string
  order?: number
  view: ContainerView
}

/**
 * Suma una vista a su contenedor (creándolo si es la primera).
 * Devuelve el contenedor resultante.
 */
export function rememberContainerView(
  extensionId: string,
  seed: ContainerSeed
): ContainerEntry {
  const existing = containers.get(key(extensionId, seed.containerId))
  if (existing) {
    if (!existing.views.some((v) => v.id === seed.view.id)) existing.views.push(seed.view)
    return existing
  }
  const entry: ContainerEntry = {
    extensionId,
    containerId: seed.containerId,
    title: seed.containerTitle ?? seed.view.name,
    order: seed.order ?? 0,
    iconSvg: seed.iconSvg,
    views: [seed.view]
  }
  containers.set(key(extensionId, seed.containerId), entry)
  return entry
}

/**
 * Vistas VISIBLES de un contenedor según sus cláusulas `when`.
 *
 * El lector de claves se inyecta (no se importa acá) para que este archivo lo
 * pueda usar el boot sin arrastrar el puente del host.
 */
export function visibleViews(
  extensionId: string,
  containerId: string,
  getKey: (key: string) => unknown
): ContainerView[] {
  return getContainerViews(extensionId, containerId).filter(
    // `hidden` gana sobre `when`: la extensión pidió que arranque oculta.
    (view) => view.hidden !== true && evaluateWhen(view.when, getKey)
  )
}

/**
 * Cláusula `when` del BOTÓN de un contenedor: verdadera si alguna de sus
 * vistas lo está. Con una sola vista sin `when`, el botón no se condiciona
 * (`undefined` = siempre visible).
 */
export function containerWhenClause(extensionId: string, containerId: string): string | undefined {
  const views = getContainerViews(extensionId, containerId)
  if (views.length === 0 || views.some((view) => !view.when)) return undefined
  return views.map((view) => `(${view.when})`).join(' || ')
}

/** Libera todos los contenedores de una extensión (desinstalar/desactivar). */
export function forgetContainerExtension(extensionId: string): void {
  for (const [mapKey, entry] of containers) {
    if (entry.extensionId === extensionId) containers.delete(mapKey)
  }
}
