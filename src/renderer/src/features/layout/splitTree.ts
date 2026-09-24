// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * splitTreeStore — árbol de splits (estilo VS Code) por slot.
 *
 * Cada slot del layout tiene un árbol cuya raíz es un leaf (la strip con
 * nombre) o un split recursivo con dos lados (horizontal/vertical). Los
 * leaves referencian strips del tabsStore; al PARTIR un leaf se crea una
 * strip NUEVA (vacía) y el drop resolver mueve la tab arrastrada ahí.
 *
 * - splitStrip(stripId, edge): parte una hoja en dos (la original + una
 *   nueva en el lado indicado) y devuelve el id de la strip nueva.
 * - removeStrip(stripId): oculta la hoja (colapsa el split al hermano; si
 *   era la raíz, el slot se cierra) y desmonta la strip del tabsStore.
 * - setRatio(splitId, ratio): resize con el handle entre los lados.
 */

import { tabsStore, type StripId } from '@features/tabs'
import type { SplitEdge } from '@features/dnd'
import type { SlotId } from './types'

export type SplitDir = 'row' | 'column'

export type SplitTreeNode =
  | { type: 'leaf'; stripId: string }
  | {
      type: 'split'
      id: string
      dir: SplitDir
      ratio: number
      children: [SplitTreeNode, SplitTreeNode]
    }

export type SlotRoots = Record<SlotId, SplitTreeNode | null>

type TreeListener = () => void

const SLOT_IDS: SlotId[] = ['left', 'center', 'right', 'bottom']

let seq = 0

function leafOf(stripId: string): SplitTreeNode {
  return { type: 'leaf', stripId }
}

function nextSplitId(): string {
  return `split:${Date.now().toString(36)}:${++seq}`
}

function nextLeafId(): string {
  return `split:${Date.now().toString(36)}:${++seq}`
}

class SplitTreeStore {
  private roots: SlotRoots = { left: null, center: null, right: null, bottom: null }
  private listeners = new Set<TreeListener>()

  // ── Estado ─────────────────────────────────────────────────────────────

  /** Raíces por defecto: cada slot es un leaf simple con su propio strip. */
  defaultRoots(): SlotRoots {
    const roots: SlotRoots = { left: null, center: null, right: null, bottom: null }
    for (const slot of SLOT_IDS) roots[slot] = leafOf(slot)
    return roots
  }

  /** Snapshot de las raíces (para persistir / inspeccionar). */
  getAll(): SlotRoots {
    return { ...this.roots }
  }

  getRoot(slot: SlotId): SplitTreeNode | null {
    return this.roots[slot]
  }

  /** Reemplaza TODO el estado (hidratación inicial / restore). */
  hydrate(roots: SlotRoots): void {
    this.roots = {
      left: roots.left ?? null,
      center: roots.center ?? null,
      right: roots.right ?? null,
      bottom: roots.bottom ?? null
    }
    this.emit()
  }

  /** Garantiza que el slot tenga raíz (leaf simple si no existía). */
  ensureRoot(slot: SlotId): void {
    if (this.roots[slot]) return
    this.roots = { ...this.roots, [slot]: leafOf(slot) }
    this.emit()
  }

  isSlotOpen(slot: SlotId): boolean {
    return !!this.roots[slot]
  }

  /** Primera hoja viva del slot (la strip por defecto para spawns). */
  firstLeafOf(slot: SlotId): StripId | null {
    const node = this.roots[slot]
    return node ? leftmostLeaf(node) : null
  }

  /** TODAS las hojas del slot (las 4 raíces + hojas de splits en v3). */
  leavesOf(slot: SlotId): StripId[] {
    const node = this.roots[slot]
    return node ? collectLeaves(node) : []
  }

  // ── Mutaciones del árbol ────────────────────────────────────────────────

  /** Cambia el ratio de un split (ResizeHandle entre los lados). */
  setRatio(splitId: string, ratio: number): void {
    const next = { ...this.roots }
    let changed = false
    for (const slot of SLOT_IDS) {
      const replaced = setRatioIn(next[slot], splitId, ratio)
      if (replaced) {
        next[slot] = replaced
        changed = true
      }
    }
    if (!changed) return
    this.roots = next
    this.emit()
  }

  /**
   * Parte el leaf `stripId` en un split direccional (estilo VS Code): crea
   * una strip NUEVA (vacía) en el tabsStore y devuelve su id para que el
   * drop resolver mueva la tab arrastrada ahí. null si el strip no es hoja
   * de ningún slot.
   */
  splitStrip(stripId: StripId, edge: SplitEdge): StripId | null {
    const newStripId = nextLeafId()
    const column = edge === 'top' || edge === 'bottom'
    const node: SplitTreeNode = {
      type: 'split',
      id: nextSplitId(),
      dir: column ? 'column' : 'row',
      ratio: 0.5,
      children:
        edge === 'left' || edge === 'top'
          ? [leafOf(newStripId), leafOf(stripId)]
          : [leafOf(stripId), leafOf(newStripId)]
    }
    const next = { ...this.roots }
    let placed = false
    for (const slot of SLOT_IDS) {
      const root = next[slot]
      if (!root) continue
      if (root.type === 'leaf' && root.stripId === stripId) {
        next[slot] = node
        placed = true
        break
      }
      const replaced = replaceLeaf(root, stripId, node)
      if (replaced) {
        next[slot] = replaced
        placed = true
        break
      }
    }
    if (!placed) return null
    // La strip nueva existe aunque todavía no tenga tabs (el placeholder
    // "Slot vacío" sigue siendo zona de drop).
    tabsStore.createStrip(newStripId)
    this.roots = next
    this.emit()
    return newStripId
  }

  /**
   * Quita una hoja del árbol: si era la raíz, el slot se oculta; si era un
   * lado de un split, el split colapsa al hermano. También desmonta la
   * strip del tabsStore (destruir sus sesiones es responsabilidad del
   * caller — ver hideStripWithSessions).
   */
  removeStrip(stripId: StripId): void {
    const next = { ...this.roots }
    let removed = false
    for (const slot of SLOT_IDS) {
      const root = next[slot]
      if (!root) continue
      if (root.type === 'leaf' && root.stripId === stripId) {
        next[slot] = null
        removed = true
        break
      }
      const pruned = removeLeaf(root, stripId)
      if (pruned.removed) {
        next[slot] = pruned.node
        removed = true
        break
      }
    }
    if (!removed) return
    tabsStore.removeStrip(stripId)
    this.roots = next
    this.emit()
  }

  // ── Suscripción ─────────────────────────────────────────────────────────

  subscribe(listener: TreeListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        // Un suscriptor roto no debe tumbar a los demás.
      }
    }
  }
}

export const splitTreeStore = new SplitTreeStore()

// ── Helpers de árbol (puros) ────────────────────────────────────────────────

function leftmostLeaf(node: SplitTreeNode): StripId {
  return node.type === 'leaf' ? node.stripId : leftmostLeaf(node.children[0])
}

function collectLeaves(node: SplitTreeNode): StripId[] {
  if (node.type === 'leaf') return [node.stripId]
  return [...collectLeaves(node.children[0]), ...collectLeaves(node.children[1])]
}

/** Reemplaza el leaf `stripId` por `split`; null si no está en el subárbol. */
function replaceLeaf(
  node: SplitTreeNode,
  stripId: string,
  split: SplitTreeNode
): SplitTreeNode | null {
  if (node.type === 'leaf') return node.stripId === stripId ? split : null
  const a = replaceLeaf(node.children[0], stripId, split)
  if (a) return { ...node, children: [a, node.children[1]] }
  const b = replaceLeaf(node.children[1], stripId, split)
  if (b) return { ...node, children: [node.children[0], b] }
  return null
}

/** Quita el leaf `stripId`; si era un lado de un split, colapsa al hermano. */
function removeLeaf(
  node: SplitTreeNode,
  stripId: string
): { node: SplitTreeNode | null; removed: boolean } {
  if (node.type === 'leaf') {
    return node.stripId === stripId ? { node: null, removed: true } : { node, removed: false }
  }
  const a = removeLeaf(node.children[0], stripId)
  const b = removeLeaf(node.children[1], stripId)
  if (!a.removed && !b.removed) return { node, removed: false }
  const children: SplitTreeNode[] = []
  if (a.node) children.push(a.node)
  if (b.node) children.push(b.node)
  if (children.length === 2) {
    return { node: { ...node, children: [children[0], children[1]] }, removed: true }
  }
  return { node: children[0] ?? null, removed: true }
}

/** Actualiza el ratio de un split por id; null si no cambió nada. */
function setRatioIn(
  node: SplitTreeNode | null,
  splitId: string,
  ratio: number
): SplitTreeNode | null {
  if (!node || node.type === 'leaf') return null
  if (node.id === splitId) return { ...node, ratio }
  const a = setRatioIn(node.children[0], splitId, ratio)
  if (a) return { ...node, children: [a, node.children[1]] }
  const b = setRatioIn(node.children[1], splitId, ratio)
  if (b) return { ...node, children: [node.children[0], b] }
  return null
}