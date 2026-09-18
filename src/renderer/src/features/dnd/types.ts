/**
 * Drag & drop del layout — tipos.
 *
 * Un drag empieza desde una MANIJA (header de panel o tab) y termina sobre
 * una ZONA (strip de tabs, contenedor de slot). El store de la sesión
 * calcula en vivo la zona bajo el cursor y un índice de inserción; al soltar,
 * el resolver ejecuta la mutación (mover / reordenar).
 */

/** Payload de un drag: una tab que se está moviendo entre strips. */
export interface TabDragPayload {
  type: 'tab'
  /** Strip de origen. */
  stripId: string
  /** Id de la tab arrastrada. */
  tabId: string
  /** Etiqueta para el ghost (opcional: se deriva del spec). */
  label?: string
}

export type DragPayload = TabDragPayload

/** Borde de una zona con isSplit (estilo VS Code). */
export type SplitEdge = 'left' | 'right' | 'top' | 'bottom'

/**
 * Zona concreta bajo el cursor: dónde caería el drop.
 * `split` solo está definido en zonas con `isSplit`: el borde del panel
 * donde se partiría (null = centro → comportamiento de strip normal).
 */
export interface DropTarget {
  /** Strip receptor. */
  stripId: string
  /**
   * Índice de inserción (posición final). Para zonas de tab es el índice
   * de la tab si cae después de ella, o uno antes si cae antes.
   */
  index: number
  /** Borde de split (zona isSplit) o null si el drop es sobre el centro. */
  split?: SplitEdge | null
}

/**
 * Descriptor de zona registrada. Cada TabStrip registra dos zonas:
 *  - el strip en sí (cualquier punto del strip)
 *  - cada tab (con su índice propio + la mitad para before/after)
 */
export interface ZoneDescriptor {
  el: HTMLElement
  kind: 'strip' | 'tab'
  stripId: string
  /** Índice de la tab (solo kind='tab'). */
  tabIndex?: number
  /** Para kind='tab': decide si el cursor cayó antes o después del medio. */
  horizontal?: boolean
  /**
   * Para kind='strip': true → el drop SIEMPRE inserta al final de la strip.
   * Lo usa el slot en modo frame (1 sola tab): soltar sobre el contenido del
   * panel deja [panel original, tab drageada] sin importar la X del cursor.
   */
  append?: boolean
  /**
   * Habilita el SPLIT direccional (estilo VS Code): el borde de la zona
   * (izquierda/derecha/arriba/abajo, banda de ~25%) parte el panel en dos
   * con la tab drageada en el lado nuevo. El centro conserva el drop
   * normal (append / reorden). Cualquier componente puede optar con esto.
   */
  isSplit?: boolean
}

export type DragPhase = 'idle' | 'dragging'
