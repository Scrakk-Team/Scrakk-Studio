/**
 * dndStore — sesión global de drag & drop (store externo + listeners).
 *
 * Un drag vive SOLO mientras el pointer está abajo sobre una manija y pasó
 * el umbral de movimiento. El store es dueño de los listeners de window
 * (pointermove / pointerup / pointercancel) y calcula la zona objetivo bajo
 * el cursor consultando las zonas registradas por los TabStrip.
 *
 * Al soltar, ejecuta el resolver (por defecto el de tabs: reordenar o mover
 * entre strips). Los componentes renderizan el ghost / indicadores leyendo
 * el estado acá (subscribe).
 */

import { tabsStore } from '@features/tabs'
import type { DragPayload, DropTarget, SplitEdge, ZoneDescriptor } from './types'

export interface DndState {
  phase: 'idle' | 'dragging'
  payload: DragPayload | null
  x: number
  y: number
  /** Zona bajo el cursor (null = fuera de cualquier zona válida). */
  target: DropTarget | null
  /** El elemento de origen (para feedback visual durante el drag). */
  sourceEl: HTMLElement | null
  /**
   * Rect (viewport) de la banda de split bajo el cursor (solo cuando
   * target.split está definido). Lo renderiza el overlay de acento; `edge`
   * dice qué borde es, para que el separador se clave en la línea exacta
   * donde caería la división.
   */
  overlay: { x: number; y: number; w: number; h: number; edge: SplitEdge } | null
}

type DndListener = (state: DndState) => void

const DRAG_THRESHOLD = 4

/** Ancho de la banda de split en cada borde (fracción del panel). */
const SPLIT_BAND = 0.22

class DndStore {
  private state: DndState = {
    phase: 'idle',
    payload: null,
    x: 0,
    y: 0,
    target: null,
    sourceEl: null,
    overlay: null
  }
  private listeners = new Set<DndListener>()
  private zones = new Map<HTMLElement, ZoneDescriptor>()
  private headerDetectionInstalled = false

  /** Zona (elemento) que detectó el último target con split, para el rect. */
  private lastZoneEl: HTMLElement | null = null

  /** Cliente del resolver: quién decide qué pasa al soltar. */
  private resolver: ((payload: DragPayload, target: DropTarget) => void) | null = null

  // Puntero abajo de la manija (antes del umbral).
  private pending: { payload: DragPayload; startX: number; startY: number } | null = null
  private active = false

  // ── Zonas ──────────────────────────────────────────────────────────────

  registerZone(el: HTMLElement, desc: Omit<ZoneDescriptor, 'el'>): () => void {
    this.zones.set(el, { ...desc, el })
    return () => {
      this.zones.delete(el)
    }
  }

  /** Zona registrada más cercana al elemento (sube por ancestros). */
  private zoneFor(el: HTMLElement | null): ZoneDescriptor | null {
    let node: HTMLElement | null = el
    while (node) {
      const desc = this.zones.get(node)
      if (desc) return desc
      node = node.parentElement
    }
    return null
  }

/**
 * Borde de split bajo el cursor dentro del rect de la zona (bandas de
 * SPLIT_BAND en cada lado). Las esquinas resuelven a izquierda/derecha
 * (prioridad VS Code). null = centro (drop normal).
 */
private splitEdgeFor(rect: DOMRect, x: number, y: number): SplitEdge | null {
  const dx = (x - rect.left) / Math.max(1, rect.width)
  const dy = (y - rect.top) / Math.max(1, rect.height)
  if (dx < SPLIT_BAND) return 'left'
  if (dx > 1 - SPLIT_BAND) return 'right'
  if (dy < SPLIT_BAND) return 'top'
  if (dy > 1 - SPLIT_BAND) return 'bottom'
  return null
}

/** Rect (viewport) de la banda visual de un borde de split (misma banda que
 * la detección: lo que se ve es exactamente lo que se detecta). */
private overlayRectFor(rect: DOMRect, edge: SplitEdge): { x: number; y: number; w: number; h: number } {
  switch (edge) {
    case 'left':
      return { x: rect.left, y: rect.top, w: rect.width * SPLIT_BAND, h: rect.height }
    case 'right':
      return { x: rect.right - rect.width * SPLIT_BAND, y: rect.top, w: rect.width * SPLIT_BAND, h: rect.height }
    case 'top':
      return { x: rect.left, y: rect.top, w: rect.width, h: rect.height * SPLIT_BAND }
    case 'bottom':
      return { x: rect.left, y: rect.bottom - rect.height * SPLIT_BAND, w: rect.width, h: rect.height * SPLIT_BAND }
  }
}

  /**
   * Índice de inserción para una zona de tipo strip: cuántas tabs (distintas
   * de la arrastrada) tienen su punto medio a la izquierda del cursor.
   */
  private computeStripIndex(desc: ZoneDescriptor, x: number): number {
    const childZones: ZoneDescriptor[] = []
    for (const zone of this.zones.values()) {
      if (zone.kind === 'tab' && zone.stripId === desc.stripId) childZones.push(zone)
    }
    // Orden por posición real en el DOM (izquierda → derecha).
    childZones.sort((a, b) => {
      const ar = a.el.getBoundingClientRect()
      const br = b.el.getBoundingClientRect()
      return ar.left - br.left || ar.top - br.top
    })
    let index = 0
    for (const zone of childZones) {
      if (zone.el === this.state.sourceEl) continue
      const rect = zone.el.getBoundingClientRect()
      if (rect.width <= 0 && rect.height <= 0) continue
      if (x > rect.left + rect.width / 2) index++
      else break
    }
    return index
  }

  private computeTarget(x: number, y: number): DropTarget | null {
    if (this.state.phase !== 'dragging') return null
    const els = document.elementsFromPoint(x, y)
    for (const candidate of els) {
      if (!(candidate instanceof HTMLElement)) continue
      const desc = this.zoneFor(candidate)
      if (!desc) continue
      // Nunca dropear sobre la propia manija (evita reordenes raros sobre
      // el header/tab que se está arrastrando).
      if (desc.el === this.state.sourceEl) continue
      const rect = desc.el.getBoundingClientRect()
      if (desc.kind === 'tab') {
        const after = x > rect.left + rect.width / 2
        const base = desc.tabIndex ?? 0
        return { stripId: desc.stripId, index: base + (after ? 1 : 0), split: null }
      }
      // Zonas de strip con isSplit: los bordes PARTEN el panel (VS Code).
      if (desc.isSplit) {
        const edge = this.splitEdgeFor(rect, x, y)
        if (edge) {
          this.lastZoneEl = desc.el
          return { stripId: desc.stripId, index: 0, split: edge }
        }
      }
      const index = desc.append
        ? (tabsStore.getStrip(desc.stripId)?.tabs.length ?? 0)
        : this.computeStripIndex(desc, x)
      return { stripId: desc.stripId, index, split: null }
    }
    return null
  }

  // ── Sesión ─────────────────────────────────────────────────────────────

  getState(): DndState {
    const s = this.state
    return { ...s, payload: s.payload ? { ...s.payload } : null }
  }

  subscribe(listener: DndListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** La manija llamó pointerdown: candidata a drag (espera el umbral). */
  beginPending(payload: DragPayload, el: HTMLElement, x: number, y: number): void {
    if (this.state.phase === 'dragging') return
    this.pending = { payload, startX: x, startY: y }
    this.state = { ...this.state, sourceEl: el }
    this.listen()
  }

  /** Resolver que se ejecuta al soltar. */
  setResolver(resolver: ((payload: DragPayload, target: DropTarget) => void) | null): void {
    this.resolver = resolver
  }

  // ── Detector global de headers drageables ──────────────────────────────

  /**
   * Instala el detector DECLARATIVO de drag: cualquier elemento con
   * `[data-drag-header]` (más `data-drag-tab` y opcional `data-drag-strip` /
   * `data-drag-label`) se convierte en manija de drag automáticamente.
   * Cualquier componente puede marcar su header así, sin imports ni hooks.
   *
   * Los controles interactivos DENTRO de un header (botones de acciones, la
   * X de cerrar, inputs) NO inician drag — salvo que el propio header sea el
   * control (una tab es un <button data-drag-header>).
   */
  installDragHeaderDetection(): void {
    if (this.headerDetectionInstalled) return
    this.headerDetectionInstalled = true
    window.addEventListener(
      'pointerdown',
      (event: PointerEvent) => {
        if (event.button !== 0) return
        const target = event.target
        // Element (no solo HTMLElement): los íconos SVG de las tabs son
        // SVGElement y también deben iniciar el drag de su header.
        if (!(target instanceof Element)) return
        const header = target.closest('[data-drag-header]')
        if (!header || !(header instanceof HTMLElement)) return
        if (header.matches('button, a, input, textarea, select')) {
          // El header ES el control (p.ej. una tab): solo respetar
          // [data-drag-ignore] (el X interno de la tab).
          if (target.closest('[data-drag-ignore]')) return
        } else {
          if (target.closest('button, a, input, textarea, select, [data-drag-ignore]')) return
        }
        const tabId = header.getAttribute('data-drag-tab')
        if (!tabId) return
        // Atributos stale (la tab pudo moverse tras un drag previo): el
        // resolver igual usa findTab como fuente real; acá validamos que
        // la tab siga existiendo.
        const located = tabsStore.findTab(tabId)
        if (!located) return
        dndStore.beginPending(
          {
            type: 'tab',
            stripId: header.getAttribute('data-drag-strip') ?? located.stripId,
            tabId,
            label: header.getAttribute('data-drag-label') ?? undefined
          },
          header,
          event.clientX,
          event.clientY
        )
        event.preventDefault()
      },
      true
    )
  }

  private listen(): void {
    if (this.active) return
    this.active = true
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerCancel)
  }

  private unlisten(): void {
    if (!this.active) return
    this.active = false
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerCancel)
  }

  private onPointerMove = (event: PointerEvent): void => {
    const { clientX, clientY } = event
    if (this.state.phase === 'idle') {
      const p = this.pending
      if (!p) return
      const dx = clientX - p.startX
      const dy = clientY - p.startY
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return
      // Promoción a drag real.
      this.pending = null
      this.state = {
        ...this.state,
        phase: 'dragging',
        payload: p.payload,
        x: clientX,
        y: clientY,
        target: null,
        overlay: null
      }
      document.body.classList.add('dnd-dragging')
      this.emit()
      return
    }
    const target = this.computeTarget(clientX, clientY)
    const changed =
      target?.stripId !== this.state.target?.stripId ||
      target?.index !== this.state.target?.index ||
      target?.split !== this.state.target?.split
    this.state = {
      ...this.state,
      x: clientX,
      y: clientY,
      target: changed ? target : this.state.target,
      overlay: this.computeOverlay(target)
    }
    this.emit()
  }

  /**
   * Rect de la banda de split para el overlay (null si no hay borde). Mide
   * la ZONA que detectó el target (el SlotBody), no la primera zona del
   * strip (que puede ser la barra de tabs).
   */
  private computeOverlay(target: DropTarget | null): DndState['overlay'] {
    if (!target?.split) return null
    const el = this.lastZoneEl ?? this.targetElFor(target.stripId)
    if (!el) return null
    const rect = this.overlayRectFor(el.getBoundingClientRect(), target.split)
    return { ...rect, edge: target.split }
  }

  /** Elemento DOM registrado como zona de un strip (para medir el rect). */
  private targetElFor(stripId: string): HTMLElement | null {
    for (const [el, desc] of this.zones) {
      if (desc.kind === 'strip' && desc.stripId === stripId) return el
    }
    return null
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (this.state.phase === 'idle') {
      this.pending = null
      this.unlisten()
      this.state = { ...this.state, sourceEl: null }
      this.emit()
      return
    }
    const target = this.computeTarget(event.clientX, event.clientY)
    const payload = this.state.payload
    const resolver = this.resolver
    if (payload && target && resolver) {
      try {
        resolver(payload, target)
      } catch {
        // Un resolver roto no debe dejar la sesión colgada.
      }
    }
    this.endSession()
  }

  private onPointerCancel = (): void => {
    this.endSession()
  }

  private endSession(): void {
    this.pending = null
    this.unlisten()
    document.body.classList.remove('dnd-dragging')
    this.state = {
      phase: 'idle',
      payload: null,
      x: 0,
      y: 0,
      target: null,
      sourceEl: null,
      overlay: null
    }
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.getState())
      } catch {
        // Suscriptor roto.
      }
    }
  }
}

export const dndStore = new DndStore()

/**
 * Instala el detector global de headers drageables ([data-drag-header]).
 * Idempotente: el método de instancia guarda contra doble instalación.
 */
export function installDragHeaderDetection(): void {
  dndStore.installDragHeaderDetection()
}
