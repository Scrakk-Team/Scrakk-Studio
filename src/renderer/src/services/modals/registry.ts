/**
 * Servicio global de modales — registry singleton con subscribe.
 *
 * Igual de desacoplado que el ContextMenu global (@ui), pero para modales:
 * cualquier módulo (statusbar, paleta, extensiones vía ctx.api) abre
 * modales sin acoplarse a componentes concretos.
 *
 * Tres primitivas:
 *  - `showModal(spec)`       — modal custom: caller pasa render(ctx).
 *  - `showOptionModal(spec)` — caso común: título + lista de opciones.
 *                              Devuelve Promise con la opción elegida.
 *  - `showAnchoredModal(spec)` — panel anclado a un rect (debajo de un
 *                              botón): SIN overlay, se cierra con Esc,
 *                              click afuera o toggle. Para popovers como el
 *                              historial de notificaciones.
 *
 * El ModalHost (features/modals/ModalHost.tsx) es el ÚNICO pintor;
 * se monta 1× en AppShell.
 */

export interface ModalHandle {
  id: string
}

/** Ctx que recibe el render custom. */
export interface ModalRenderContext {
  close: () => void
}

/** Tamaños del panel (re-exportado del Modal UI). */
export type ModalSize = 'sm' | 'md' | 'xl'

export interface ModalSpecBase {
  title: string
  size?: ModalSize
  /** true = no cierra con Esc/click afuera. Default true. */
  dismissable?: boolean
  /**
   * Se llama cuando el HOST cierra el modal (Esc, click afuera, toggle).
   * Sirve para resolver estados pendientes (ej. confirmaciones de tools).
   */
  onClose?: () => void
}

export interface CustomModalSpec extends ModalSpecBase {
  kind: 'custom'
  render: (ctx: ModalRenderContext) => unknown
  /**
   * 'panel' (default): modal centrado con overlay.
   * 'plain': SIN overlay ni sombra — el contenido se centra flotando y deja
   * interactuar con la app detrás (lo usa el chat spawneado de un subagente).
   */
  variant?: 'panel' | 'plain'
  /**
   * Solo con `variant: 'plain'`: selector del contenedor DOM donde montar el
   * panel (ej. `[data-modal-portal="chat"]`). Sin esto, se centra flotando.
   */
  portalSelector?: string
}

/** Rectángulo de anclaje en coords de viewport (del botón que lo abre). */
export interface AnchoredRect {
  x: number
  y: number
  width: number
  height: number
}

export interface AnchoredModalSpec {
  kind: 'anchored'
  /** Key para toggle/dedupe (ej. 'notifications-history'). Opcional. */
  key?: string
  title: string
  /** Ancla el panel: se abre pegado a este rect (statusbar → hacia arriba). */
  anchor: AnchoredRect
  /** Ancho del panel en px. Default 320. */
  width?: number
  /**
   * Hacia dónde abre: 'above' (statusbar, default) o 'below' (titlebar).
   * Default 'above' para no cambiar los callers existentes.
   */
  placement?: 'above' | 'below'
  /**
   * Alineación horizontal respecto al ancla: 'end' (borde derecho con el
   * del botón, default), 'start' (borde izquierdo) o 'center' (centrado
   * sobre el botón, ej. dropdowns de breadcrumbs). Siempre con clamp al
   * viewport. Default 'end' para no cambiar los callers existentes.
   */
  align?: AnchoredAlign
  render: (ctx: ModalRenderContext) => unknown
  /** Se llama cuando el host lo cierra (Esc/click afuera/toggle). */
  onClose?: () => void
}

/** Alineación horizontal del panel anclado respecto a su ancla. */
export type AnchoredAlign = 'start' | 'center' | 'end'

/**
 * Posición X de un panel anclado (pura, testeable): alinea según `align`
 * y clampea al viewport con 8px de margen.
 */
export function anchoredX(
  anchorX: number,
  anchorWidth: number,
  panelWidth: number,
  viewportWidth: number,
  align: AnchoredAlign = 'end'
): number {
  let x: number
  if (align === 'center') x = anchorX + anchorWidth / 2 - panelWidth / 2
  else if (align === 'start') x = anchorX
  else x = anchorX + anchorWidth - panelWidth
  return Math.min(Math.max(8, x), Math.max(8, viewportWidth - panelWidth - 8))
}

export interface OptionItem {
  id: string
  label: string
  description?: string
  /** Texto mono a la derecha (id técnico, shortcut…). */
  hint?: string
  disabled?: boolean
  danger?: boolean
  separatorBefore?: boolean
}

export interface OptionsModalSpec extends ModalSpecBase {
  kind: 'options'
  items: Array<OptionItem>
  emptyMessage?: string
}

type AnySpec = CustomModalSpec | OptionsModalSpec | AnchoredModalSpec

interface StoredModal {
  spec: AnySpec
  /** Resolver de option modals (null = cancelado). */
  resolve?: (value: string | null) => void
}

type Listener = () => void

let seq = 0
const active = new Map<string, StoredModal>()
const listeners = new Set<Listener>()

function emit(): void {
  for (const l of listeners) {
    try {
      l()
    } catch {
      // Un listener roto no tumba a los demás.
    }
  }
}

export function showModal(spec: Omit<CustomModalSpec, 'kind'>): ModalHandle {
  const id = `modal-${++seq}`
  active.set(id, { spec: { ...spec, kind: 'custom' } })
  emit()
  return { id }
}

/** Modal de opciones → Promise<id|null>. */
export function showOptionModal(
  spec: Omit<OptionsModalSpec, 'kind'>
): Promise<string | null> {
  return new Promise((resolve) => {
    const id = `modal-${++seq}`
    active.set(id, { spec: { ...spec, kind: 'options' }, resolve })
    emit()
  })
}

/**
 * Panel anclado (popover): sin overlay, posicionado desde `anchor`.
 * Si ya hay uno abierto con el mismo `key`, lo cierra (toggle) y devuelve
 * null. Si no, lo abre y devuelve su handle.
 */
export function showAnchoredModal(
  spec: Omit<AnchoredModalSpec, 'kind'>
): ModalHandle | null {
  if (spec.key) {
    for (const [id, entry] of active) {
      if (entry.spec.kind === 'anchored' && entry.spec.key === spec.key) {
        active.delete(id)
        emit()
        return null
      }
    }
  }
  const id = `modal-${++seq}`
  active.set(id, { spec: { ...spec, kind: 'anchored' } })
  emit()
  return { id }
}

/** Id del anchored abierto con ese key (null si no hay). */
export function anchoredModalId(key: string): string | null {
  for (const [id, entry] of active) {
    if (entry.spec.kind === 'anchored' && entry.spec.key === key) return id
  }
  return null
}

/** Cierra un modal puntual. Los option modals resuelven null. */
export function closeModal(handleOrId: ModalHandle | string): void {
  const id = typeof handleOrId === 'string' ? handleOrId : handleOrId.id
  const entry = active.get(id)
  if (!entry) return
  active.delete(id)
  entry.resolve?.(null)
  try {
    entry.spec.onClose?.()
  } catch {
    // Un onClose roto no debe tumbar al host.
  }
  emit()
}

/** Resuelve un option modal con un valor y lo cierra. */
export function resolveOptionModal(handleOrId: ModalHandle | string, value: string): void {
  const id = typeof handleOrId === 'string' ? handleOrId : handleOrId.id
  const entry = active.get(id)
  if (!entry || entry.spec.kind !== 'options') return
  active.delete(id)
  entry.resolve?.(value)
  emit()
}

/** Cierra todos (recarga de workspace, etc.). */
export function closeAllModals(): void {
  for (const entry of [...active.values()]) entry.resolve?.(null)
  active.clear()
  emit()
}

export function listActiveModals(): string[] {
  return [...active.keys()]
}

export function isModalOpen(): boolean {
  return active.size > 0
}

/** Snapshot ordenado por inserción (orden de stack visual). */
export function snapshotModals(): Array<{ id: string; spec: AnySpec }> {
  return [...active.entries()].map(([id, m]) => ({ id, spec: m.spec }))
}

/** Suscripción del host. Devuelve unsubscribe. */
export function subscribeToModals(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
