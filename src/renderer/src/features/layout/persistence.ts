/**
 * Persistencia del layout v3 — serialización pura (testeable).
 *
 * - v2: cada slot era un strip con varias tabs + activa.
 * - v3: además, cada slot tiene un ÁRBOL DE SPLITS (estilo VS Code): su raíz
 *   es un leaf (la strip misma) o un split recursivo con dos lados. Se
 *   persisten TODAS las strips vivas (las 4 raíces + las hojas de los
 *   splits), no solo los slots con nombre.
 * - NO se persisten: la tab 'welcome' (derivada), los archivos en el centro
 *   (derivan de editorBus) ni tabs 'custom'. Sí se persisten los archivos
 *   movidos a slots no-centrales.
 * - Migración: v1 (un PanelId por slot) → v2 (multi-tab) → v3 (árbol de
 *   splits con leaves = los slots). El layout v2 parseado se eleva a v3.
 */

import { readLayoutSlotsRaw, writeLayoutSlotsRaw } from '@services/storage'
import type {
  LegacyLayoutSlotsData,
  PersistedLayoutData,
  PersistedLayoutV3Data,
  PersistedSlotData,
  PersistedSplitTree
} from '@services/storage'
import {
  explorerTab,
  panelTab,
  tabsStore,
  terminalTab,
  welcomeTab,
  tabPersistsByDefault,
  type StripId,
  type StripState,
  type TabSpec
} from '@features/tabs'
import { splitTreeStore, type SlotRoots, type SplitTreeNode } from './splitTree'
import type { SlotId } from './types'

export const SLOT_IDS: SlotId[] = ['left', 'center', 'right', 'bottom']

/** Id de la sesión de terminal por defecto (la del slot bottom inicial). */
export const MAIN_TERMINAL_SESSION = 'main'

export function toStripId(slot: SlotId): StripId {
  return slot as StripId
}

// ── Defaults ────────────────────────────────────────────────────────────────

/** Layout por defecto (primer arranque / slots faltantes). */
export function defaultSlots(): Record<SlotId, StripState | null> {
  const center: StripState = {
    stripId: 'center',
    tabs: [welcomeTab()],
    activeId: 'welcome'
  }
  return {
    left: { stripId: 'left', tabs: [panelTab('explorer', 'Explorador')], activeId: 'panel:explorer' },
    center,
    right: { stripId: 'right', tabs: [panelTab('chat', 'Chat')], activeId: 'panel:chat' },
    bottom: {
      stripId: 'bottom',
      tabs: [terminalTab(MAIN_TERMINAL_SESSION, 'Terminal')],
      activeId: `term:${MAIN_TERMINAL_SESSION}`
    }
  }
}

// ── Serialización ───────────────────────────────────────────────────────────

function serializeTab(tab: TabSpec): PersistedSlotData['tabs'][number] | null {
  switch (tab.kind) {
    case 'panel':
      return { id: tab.id, kind: 'panel', panelId: tab.panelId, label: tab.label }
    case 'file':
      return { id: tab.id, kind: 'file', filePath: tab.filePath, label: tab.label }
    case 'terminal':
      return { id: tab.id, kind: 'terminal', sessionId: tab.sessionId, label: tab.label }
    case 'explorer':
      if (!tab.rootPath) return null
      return { id: tab.id, kind: 'explorer', rootPath: tab.rootPath, label: tab.label }
    case 'welcome':
      return null
  }
}

function serializeStrip(strip: StripState, stripId: string): PersistedSlotData {
  const persisted: PersistedSlotData = { tabs: [], activeId: strip.activeId ?? null }
  if (strip.splitDir) persisted.splitDir = strip.splitDir
  for (const tab of strip.tabs) {
    if (!tabPersistsByDefault(tab, stripId)) continue
    const serialized = serializeTab(tab)
    if (serialized) persisted.tabs.push(serialized)
  }
  return persisted
}

/** Serializa los strips de los 4 slots del layout a la forma v2 (legacy). */
export function serializeSlots(
  slots: Record<SlotId, StripState | null>
): PersistedLayoutData {
  const data: PersistedLayoutData = { v: 2, slots: { left: null, center: null, right: null, bottom: null } }
  for (const slot of SLOT_IDS) {
    const strip = slots[slot]
    if (!strip || strip.tabs.length === 0) {
      data.slots[slot] = null
      continue
    }
    data.slots[slot] = serializeStrip(strip, slot)
  }
  return data
}

function serializeTree(node: SplitTreeNode): PersistedSplitTree {
  if (node.type === 'leaf') return { type: 'leaf', stripId: node.stripId }
  return {
    type: 'split',
    id: node.id,
    dir: node.dir,
    ratio: node.ratio,
    children: [serializeTree(node.children[0]), serializeTree(node.children[1])]
  }
}

/**
 * Serializa el layout v3: TODAS las strips vivas (raíces + hojas de splits)
 * + el árbol de splits por slot. Las strips vacías no se persisten (sus
 * leaves colapsan al rehidratar, como VS Code olvida grupos vacíos).
 * `sizes` (opcional): anchos px de slots externos del commit ghost.
 */
export function serializeLayout(
  strips: Record<StripId, StripState | null>,
  roots: SlotRoots,
  sizes?: { left?: number; right?: number; bottom?: number }
): PersistedLayoutV3Data {
  const slots: Record<string, PersistedSlotData | null> = {}
  for (const [stripId, strip] of Object.entries(strips)) {
    if (!strip || strip.tabs.length === 0) {
      slots[stripId] = null
      continue
    }
    slots[stripId] = serializeStrip(strip, stripId)
  }
  const tree: Record<SlotId, PersistedSplitTree | null> = {
    left: null,
    center: null,
    right: null,
    bottom: null
  }
  for (const slot of SLOT_IDS) {
    const root = roots[slot]
    tree[slot] = root ? serializeTree(root) : null
  }
  const data: PersistedLayoutV3Data = { v: 3, slots, tree }
  if (sizes && (sizes.left !== undefined || sizes.right !== undefined || sizes.bottom !== undefined)) {
    data.slotSizes = { ...sizes }
  }
  return data
}

// ── Deserialización / migración ─────────────────────────────────────────────

function deserializeTab(raw: PersistedSlotData['tabs'][number]): TabSpec | null {
  switch (raw.kind) {
    case 'panel':
      return panelTab(raw.panelId ?? raw.id, raw.label)
    case 'file':
      if (!raw.filePath) return null
      return {
        id: raw.id,
        kind: 'file',
        filePath: raw.filePath,
        label: raw.label ?? raw.filePath.split(/[/\\\\]/).pop() ?? 'Archivo',
        closable: true,
        persist: true
      }
    case 'terminal':
      return terminalTab(raw.sessionId ?? raw.id, raw.label)
    case 'explorer':
      if (!raw.rootPath) return null
      return explorerTab(raw.rootPath, raw.label)
    default:
      return null
  }
}

/** Convierte un slot v2 persistido a estado de strip. */
function deserializeSlot(stripId: string, data: PersistedSlotData | null | undefined): StripState | null {
  if (!data) return null
  const tabs = (data.tabs ?? []).map((tab) => deserializeTab(tab)).filter((t): t is TabSpec => !!t)
  // El centro siempre arranca con Bienvenida (derivada, no persistida).
  if (stripId === 'center' && !tabs.some((t) => t.kind === 'welcome')) {
    tabs.unshift(welcomeTab())
  }
  if (tabs.length === 0) return null
  const activeId = data.activeId && tabs.some((t) => t.id === data.activeId) ? data.activeId : tabs[0].id
  return { stripId, tabs, activeId, splitDir: data.splitDir }
}

/** Convierte un slot v1 (panel único) a estado de strip v2. */
function migrateSlotV1(slot: SlotId, panelId: string | null): StripState | null {
  if (!panelId) return null
  if (slot === 'center') {
    // El editor era un sentinel transitorio: en v2 los archivos derivan de
    // editorBus. La bienvenida siempre abre el centro.
    const center: StripState = { stripId: 'center', tabs: [welcomeTab()], activeId: 'welcome' }
    if (panelId === 'welcome' || panelId === 'editor') return center
    center.tabs.push(panelTab(panelId))
    center.activeId = `panel:${panelId}`
    return center
  }
  if (panelId === 'innerta-terminal') {
    const tab = terminalTab(MAIN_TERMINAL_SESSION, 'Terminal')
    return { stripId: slot, tabs: [tab], activeId: tab.id }
  }
  const tab = panelTab(panelId)
  return { stripId: slot, tabs: [tab], activeId: tab.id }
}

/** True si el raw tiene forma v2 ({ v: 2, slots }). */
export function isV2Layout(raw: unknown): raw is PersistedLayoutData {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  return r.v === 2 && !!r.slots && typeof r.slots === 'object'
}

/** True si el raw tiene forma v3 ({ v: 3, slots, tree }). */
export function isV3Layout(raw: unknown): raw is PersistedLayoutV3Data {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  return r.v === 3 && !!r.slots && !!r.tree && typeof r.slots === 'object' && typeof r.tree === 'object'
}

function deserializeTree(
  node: PersistedSplitTree,
  stripExists: (stripId: string) => boolean
): SplitTreeNode | null {
  if (node.type === 'leaf') {
    return stripExists(node.stripId) ? { type: 'leaf', stripId: node.stripId } : null
  }
  const a = deserializeTree(node.children[0], stripExists)
  const b = deserializeTree(node.children[1], stripExists)
  if (!a && !b) return null
  if (!a) return b
  if (!b) return a
  return { type: 'split', id: node.id, dir: node.dir, ratio: node.ratio, children: [a, b] }
}

/** Migra / parsea el storage crudo a slots + árbol (null si no hay nada). */
export function parsePersistedLayout(): {
  /** TODAS las strips (los 4 slots + hojas de splits en v3). */
  slots: Record<StripId, StripState | null>
  tree: SlotRoots
} | null {
  const raw = readLayoutSlotsRaw()
  if (raw === null || raw === undefined) return null
  const defaults = defaultSlots()

  if (isV3Layout(raw)) {
    // v3: slots = TODAS las strips; tree = árbol por slot.
    const allStrips: Record<StripId, StripState | null> = {}
    for (const [stripId, data] of Object.entries(raw.slots)) {
      allStrips[stripId] = deserializeSlot(stripId, data)
    }
    // Slots con nombre ausentes del storage Y del árbol (v3 parcial) →
    // default. Un slot con tree = null fue OCULTADO por el usuario y no
    // se resucita.
    for (const slot of SLOT_IDS) {
      if (allStrips[slot] === undefined && raw.tree[slot] === undefined) {
        allStrips[slot] = defaults[slot] ?? null
      }
    }
    // Existe = strip persistida (null o undefined → no existe).
    const stripExists = (stripId: string): boolean => !!allStrips[stripId]
    const tree: SlotRoots = { left: null, center: null, right: null, bottom: null }
    for (const slot of SLOT_IDS) {
      const rawTree = raw.tree[slot]
      if (rawTree) {
        tree[slot] = deserializeTree(rawTree, stripExists)
      } else if (allStrips[slot]) {
        // Sin árbol (v3 parcial) → leaf simple del strip.
        tree[slot] = { type: 'leaf', stripId: slot }
      }
    }
    return { slots: allStrips, tree }
  }

  if (isV2Layout(raw)) {
    const slots: Record<SlotId, StripState | null> = { left: null, center: null, right: null, bottom: null }
    for (const slot of SLOT_IDS) {
      const value = raw.slots[slot]
      // undefined = slot nunca persistido (formato v2 anterior) → default.
      // null = slot ocultado por el usuario (se respeta).
      if (value === undefined) slots[slot] = defaults[slot] ?? null
      else slots[slot] = deserializeSlot(slot, value)
    }
    const tree: SlotRoots = { left: null, center: null, right: null, bottom: null }
    for (const slot of SLOT_IDS) {
      if (slots[slot]) tree[slot] = { type: 'leaf', stripId: slot }
    }
    return { slots, tree }
  }

  // Formato v1 (un panel por slot).
  if (raw && typeof raw === 'object') {
    const legacy = raw as LegacyLayoutSlotsData
    const slots: Record<SlotId, StripState | null> = { left: null, center: null, right: null, bottom: null }
    for (const slot of SLOT_IDS) {
      const panelId = legacy[slot]
      slots[slot] = panelId === undefined ? defaults[slot] : migrateSlotV1(slot, panelId)
    }
    const tree: SlotRoots = { left: null, center: null, right: null, bottom: null }
    for (const slot of SLOT_IDS) {
      if (slots[slot]) tree[slot] = { type: 'leaf', stripId: slot }
    }
    return { slots, tree }
  }
  return null
}

/** Solo los 4 slots con nombre (compatibilidad con el parseo v2 histórico). */
export function parsePersistedSlots(): Record<SlotId, StripState | null> | null {
  const parsed = parsePersistedLayout()
  if (!parsed) return null
  const out: Record<SlotId, StripState | null> = { left: null, center: null, right: null, bottom: null }
  for (const slot of SLOT_IDS) out[slot] = parsed.slots[slot] ?? null
  return out
}

/**
 * Migración de CONTENIDO DIVIDIDO (legacy) a GRUPOS REALES del árbol.
 *
 * En el modelo viejo un strip podía marcar `splitDir` y mostrar un panel por
 * tab bajo una barra compartida. Ahora los splits son hojas del árbol: cada
 * strip raíz con `splitDir` se eleva a un split de dos hojas con la MISMA
 * dirección (la primera tab en un lado, el resto en el otro). Los árboles ya
 * partidos se respetan tal cual. Idempotente.
 */
export function migrateContentSplits(
  slots: Record<StripId, StripState | null>,
  tree: SlotRoots
): { slots: Record<StripId, StripState | null>; tree: SlotRoots; migrated: boolean } {
  const nextSlots: Record<StripId, StripState | null> = { ...slots }
  const nextTree: SlotRoots = { ...tree }
  let migrated = false
  for (const slot of SLOT_IDS) {
    const root = nextTree[slot]
    if (!root || root.type !== 'leaf') continue
    const strip = nextSlots[root.stripId]
    if (!strip || !strip.splitDir || strip.tabs.length < 2) continue
    const [first, ...rest] = strip.tabs
    if (!first || rest.length === 0) continue
    const secondId = `${slot}:split-1`
    if (nextSlots[secondId]) continue
    const active = strip.activeId
    nextSlots[root.stripId] = { stripId: root.stripId, tabs: [first], activeId: first.id }
    nextSlots[secondId] = {
      stripId: secondId,
      tabs: rest,
      activeId: active && rest.some((t) => t.id === active) ? active : rest[0].id
    }
    nextTree[slot] = {
      type: 'split',
      id: `split:${slot}:1`,
      dir: strip.splitDir,
      ratio: 0.5,
      children: [
        { type: 'leaf', stripId: root.stripId },
        { type: 'leaf', stripId: secondId }
      ]
    }
    migrated = true
  }
  return { slots: nextSlots, tree: nextTree, migrated }
}

/**
 * Estado inicial del layout: lo persistido (migrado si hace falta) o el
 * default. Los splits son GRUPOS REALES del árbol; el contenido dividido
 * legacy (`splitDir`) se eleva a un árbol de dos hojas.
 */
export function hydrateLayout(): {
  slots: Record<StripId, StripState | null>
  tree: SlotRoots
  migrated: boolean
} {
  const parsed = parsePersistedLayout()
  if (!parsed) {
    return { slots: defaultSlots(), tree: splitTreeStore.defaultRoots(), migrated: false }
  }
  return migrateContentSplits(parsed.slots, parsed.tree)
}

/** Persiste los slots del layout (forma v2, legacy — tests). */
export function persistSlots(strips: Record<SlotId, StripState | null>): void {
  writeLayoutSlotsRaw(serializeSlots(strips))
}

/** Snapshot actual de los 4 slots (para persistir / leer estado del layout). */
export function layoutSlotsSnapshot(): Record<SlotId, StripState | null> {
  const out: Record<SlotId, StripState | null> = { left: null, center: null, right: null, bottom: null }
  for (const slot of SLOT_IDS) {
    out[slot] = tabsStore.getStrip(slot)
  }
  return out
}

/** Persiste el layout v3 completo (strips + árbol) desde los stores. */
export function persistLayoutSnapshot(): void {
  // Carga perezosa: si este proceso aún no fijó anchos (p. ej. persist por
  // cambio de tabs antes de montar PanelLayout), se conservan los de disco
  // en vez de borrarlos.
  if (!slotSizesCache) {
    const stored = loadSlotSizes()
    if (Object.keys(stored).length > 0) slotSizesCache = stored
  }
  writeLayoutSlotsRaw(
    serializeLayout(tabsStore.getAll(), splitTreeStore.getAll(), slotSizesCache ?? undefined)
  )
}

// ── Tamaños px de slots externos (Tipo A, commits ghost) ────────────────────
// Viven en módulo (no en store): PanelLayout los escribe en cada commit y
// persistLayoutSnapshot los incluye. Antes se perdían al recargar.

export interface SlotSizes {
  left?: number
  right?: number
  bottom?: number
}

let slotSizesCache: SlotSizes | null = null

export function setSlotSizesCache(sizes: SlotSizes): void {
  slotSizesCache = { ...sizes }
}

function validSize(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

/** Lee los tamaños persistidos (boot). Basura → {} (valen los defaults). */
export function loadSlotSizes(): SlotSizes {
  try {
    const raw = readLayoutSlotsRaw() as { slotSizes?: Record<string, unknown> } | null
    const sizes = raw?.slotSizes
    if (!sizes || typeof sizes !== 'object') return {}
    const out: SlotSizes = {}
    const left = validSize(sizes.left)
    const right = validSize(sizes.right)
    const bottom = validSize(sizes.bottom)
    if (left !== undefined) out.left = left
    if (right !== undefined) out.right = right
    if (bottom !== undefined) out.bottom = bottom
    return out
  } catch {
    return {}
  }
}

/**
 * Boot del layout: hidrata los strips (tabsStore) y el árbol de splits
 * (splitTreeStore) UNA vez (idempotente) y re-escribe el storage en formato
 * v3 si venía de v1/v2.
 */
let booted = false
export function bootLayoutStrips(): void {
  if (booted) return
  booted = true
  const raw = readLayoutSlotsRaw()
  const { slots, tree, migrated } = hydrateLayout()
  // Hidrata TODAS las strips que el árbol referencia (los 4 slots con nombre
  // en v1/v2; + las hojas de splits en v3).
  const hydrated: Record<StripId, StripState> = {}
  for (const slot of SLOT_IDS) {
    collectTreeStrips(tree[slot]).forEach((stripId) => {
      const strip = slots[stripId]
      if (strip && strip.tabs.length > 0) hydrated[stripId] = strip
    })
  }
  tabsStore.hydrate(hydrated)
  splitTreeStore.hydrate(tree)
  // Persistir migración (v1/v2 → v3, o contenido dividido → grupos reales)
  // si el raw no era v3 o si hubo que elevar splits legacy.
  if (!isV3Layout(raw) || migrated) {
    persistLayoutSnapshot()
  }
}

/** Strips hoja de un árbol persistido (para hidratar el tabsStore). */
function collectTreeStrips(node: SplitTreeNode | null): StripId[] {
  if (!node) return []
  if (node.type === 'leaf') return [node.stripId]
  return [...collectTreeStrips(node.children[0]), ...collectTreeStrips(node.children[1])]
}