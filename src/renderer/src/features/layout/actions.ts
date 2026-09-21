/**
 * Acciones del layout multi-tab (sin React: operan sobre tabsStore).
 *
 * - openPanelTab / openTerminalTab: spawn/activa tabs de paneles o de
 *   sesiones de terminal (cualquier componente puede llamarlas).
 * - setSlotPanel / toggleSlotPanel: semántica LEGACY (un panel por slot)
 *   traducida al mundo multi-tab, para que ActivityBar, MenuBar,
 *   LayoutToggles, CommandsBridge y ClockPanel sigan funcionando intactos.
 * - reconcileFileTabs: puente con editorBus (los archivos abiertos derivan
 *   sus tabs al centro; cerrar un archivo destruye su sesión).
 */

import { productIcon } from '@services/productIcons/components'
import type { ComponentType } from 'react'
import {
  activateFile,
  clearActiveFile,
  getEditorFiles,
  openFileInEditor,
  reorderOpenFilesTo,
  type EditorFileTab
} from '@features/editor/editorBus'
import { destroyFileSession } from '@features/editor/fileSession'
import { requestCloseFile } from '@features/editor/closeGuard'
import { destroyTerminalSession } from '@services/innerta/terminalSession'
import { getFileIconUrl } from '@services/fileIcons'
import { fileIconImageComponent } from '@services/fileIcons/components'
import { tabsStore, panelTab, terminalTab, welcomeTab, explorerTab, type StripId, type TabSpec } from '@features/tabs'
import type { ResourceDragItem } from '@features/dnd/resource'
import { ExtensionRegistry } from '@services/extensions'
import { getPanel } from './registry'
import { splitTreeStore } from './splitTree'
import type { PanelId, SlotId } from './types'

/** PanelId histórico de la terminal (el extension contribuía así el panel). */
export const TERMINAL_PANEL_ID = 'innerta-terminal'

/** Iconos UI por defecto (identidad estable: no recrearlos por render). */
const HOME_ICON = productIcon('home')
const FILE_ICON = productIcon('file')
const FOLDER_ICON = productIcon('folder')

const SLOTS: SlotId[] = ['left', 'center', 'right', 'bottom']

/**
 * TODAS las strips vivas (las 4 raíces + las hojas de splits). El layout
 * multi-split ya no puede asumir que las tabs viven en los strips de slot:
 * buscan en el árbol real.
 */
function allStripIds(): StripId[] {
  return Object.keys(tabsStore.getAll())
}

// ── Estado transitorio del centro ──────────────────────────────────────────
// Si el usuario "esconde" el centro (toggle off) con archivos abiertos, los
// tabs de archivo se ocultan pero las sesiones siguen vivas: suppress evita
// que el reconcile los re-spawnee hasta volver a mostrar el centro.
let centerSuppressed = false

export function isCenterSuppressed(): boolean {
  return centerSuppressed
}

// ── Helpers de specs ───────────────────────────────────────────────────────

function panelLabel(panelId: PanelId): string {
  return getPanel(panelId)?.title ?? panelId
}

/** Id de sesión de terminal: 'main' mientras no exista otra, luego únicos. */
function nextTerminalSessionId(): string {
  let hasMain = false
  for (const stripId of allStripIds()) {
    const strip = tabsStore.getStrip(stripId)
    if (strip?.tabs.some((t) => t.kind === 'terminal' && t.sessionId === 'main')) hasMain = true
  }
  if (!hasMain) return 'main'
  return `term-${Date.now()}`
}

// ── Búsquedas ──────────────────────────────────────────────────────────────

function findFileTab(filePath: string): { stripId: string; tabId: string } | null {
  for (const stripId of allStripIds()) {
    const strip = tabsStore.getStrip(stripId)
    if (!strip) continue
    const tab = strip.tabs.find((t) => t.kind === 'file' && t.filePath === filePath)
    if (tab) return { stripId, tabId: tab.id }
  }
  return null
}

// ── Apertura de tabs (API nueva) ───────────────────────────────────────────

/**
 * Strip destino por defecto de un slot: la primera hoja viva del árbol (si
 * el slot está partido, los spawns van al primer lado; el strip del slot
 * mismo sigue siendo la primera hoja en casi todos los casos).
 */
function targetStripOf(slot: SlotId): StripId {
  splitTreeStore.ensureRoot(slot)
  return splitTreeStore.firstLeafOf(slot) ?? slot
}

/**
 * Cierra la tab de un panel en CUALQUIER strip (si está abierta).
 *
 * Lo usan los paneles de extensión: cuando la extensión cierra su panel, su
 * tab se tiene que ir aunque el usuario la haya movido a otro slot o a un
 * split.
 */
export function closePanelTabEverywhere(panelId: PanelId): void {
  const tabId = `panel:${panelId}`
  for (const stripId of allStripIds()) {
    const strip = tabsStore.getStrip(stripId)
    if (strip?.tabs.some((tab) => tab.id === tabId)) tabsStore.closeTab(stripId, tabId)
  }
}

/** Spawnea (o activa) la tab de un panel en un slot. Es la API que usan las
 * acciones: botones, comandos y extensiones abren un panel como tab.
 */
export function openPanelTab(slot: SlotId, panelId: PanelId): void {
  if (panelId === TERMINAL_PANEL_ID) {
    openTerminalTab(slot)
    return
  }
  if (panelId === 'welcome' || panelId === 'editor') {
    setSlotPanel('center', panelId)
    return
  }
  const id = `panel:${panelId}`
  const stripId = targetStripOf(slot)
  const strip = tabsStore.getStrip(stripId)
  if (strip?.tabs.some((t) => t.id === id)) {
    tabsStore.activateTab(stripId, id)
    return
  }
  const spec: TabSpec = panelTab(panelId, panelLabel(panelId))
  tabsStore.spawnTab(stripId, spec)
}

/** Spawnea (o activa) una tab de TERMINAL (sesión viva) en un slot. */
export function openTerminalTab(slot: SlotId): void {
  const stripId = targetStripOf(slot)
  const strip = tabsStore.getStrip(stripId)
  if (strip) {
    const existing = strip.tabs.find((t) => t.kind === 'terminal')
    if (existing) {
      tabsStore.activateTab(stripId, existing.id)
      return
    }
  }
  const sessionId = nextTerminalSessionId()
  tabsStore.spawnTab(stripId, terminalTab(sessionId, 'Terminal'))
}

/**
 * Crea SIEMPRE una tab de terminal nueva (botón "+" explícito).
 * A diferencia de openTerminalTab, no reutiliza la existente.
 */
export function openNewTerminalTab(slot: SlotId): void {
  const stripId = targetStripOf(slot)
  tabsStore.spawnTab(stripId, terminalTab(nextTerminalSessionId(), 'Terminal'))
}

/**
 * Suelta un recurso del explorador (archivo/carpeta) sobre una strip:
 * - archivo  → tab de archivo en ESA strip (y abre la sesión del editor).
 * - carpeta  → tab de explorador sobre esa carpeta (una instancia por raíz).
 *
 * Es la contraparte de `useResourceDrop`: el drag NATIVO del explorador cae en
 * el sistema de tabs sin tocar el drag por pointer de las tabs.
 */
export function openResourceTabs(
  stripId: StripId,
  items: ResourceDragItem[],
  index?: number
): void {
  let at = index
  for (const item of items) {
    if (item.kind === 'folder') {
      const id = `explorer:${item.path}`
      const existing = tabsStore.findTab(id)
      if (existing) {
        tabsStore.activateTab(existing.stripId, id)
        continue
      }
      tabsStore.spawnTab(
        stripId,
        explorerTab(item.path, item.name),
        at === undefined ? undefined : { index: at }
      )
    } else {
      const id = `file:${item.path}`
      const existing = tabsStore.findTab(id)
      if (existing) {
        tabsStore.activateTab(existing.stripId, id)
        activateFile(item.path)
        continue
      }
      tabsStore.spawnTab(
        stripId,
        {
          id,
          kind: 'file',
          filePath: item.path,
          label: item.name,
          closable: true,
          persist: true
        },
        at === undefined ? undefined : { index: at }
      )
      openFileInEditor(item.path, item.name)
    }
    if (at !== undefined) at += 1
  }
}

// ── Cierre / activación inteligente ────────────────────────────────────────

/**
 * Cierra la tab respetando su naturaleza:
 * - file: cierra el archivo en editorBus (el reconcile quita la tab y la
 *   sesión en cualquier strip donde esté).
 * - terminal: destruye la sesión (PTY muere) + cierra la tab.
 * - panel/welcome: cierra solo la tab.
 */
export function closeTabSmart(stripId: string, tab: TabSpec): void {
  if (tab.kind === 'file' && tab.filePath) {
    // Guardia dirty: un archivo con cambios sin guardar no se tira callando.
    requestCloseFile(tab.filePath)
    return
  }
  if (tab.kind === 'terminal' && tab.sessionId) {
    destroyTerminalSession(tab.sessionId)
  }
  tabsStore.closeTab(stripId, tab.id)
}

/** Activa la tab y sincroniza editorBus (activePath) con el archivo. */
export function activateTabSmart(stripId: string, tab: TabSpec): void {
  tabsStore.activateTab(stripId, tab.id)
  if (tab.kind === 'file' && tab.filePath) {
    activateFile(tab.filePath)
  } else if (tab.kind === 'welcome') {
    clearActiveFile()
  }
}

// ── Centro (welcome + archivos derivados) ──────────────────────────────────

/**
 * Garantiza que el centro exista con su tab Bienvenida (no la activa). El
 * strip 'center' SIEMPRE es la hoja original del árbol central (los splits
 * parten A SU ALREDEDOR), así que la bienvenida vive ahí.
 */
function ensureCenter(): void {
  centerSuppressed = false
  splitTreeStore.ensureRoot('center')
  const strip = tabsStore.getStrip('center')
  if (!strip) {
    tabsStore.spawnTab('center', welcomeTab(), { activate: false })
    return
  }
  if (!strip.tabs.some((t) => t.kind === 'welcome')) {
    tabsStore.spawnTab('center', welcomeTab(), { index: 0, activate: false })
  }
}

/** Oculta TODO el centro (toggle off), sin destruir sesiones de archivos. */
function hideCenter(): void {
  centerSuppressed = true
  hideSlot('center')
}

/**
 * OCULTA UNA STRIP (hoja del árbol) destruyendo sus sesiones vivas
 * (terminales): ocultar no debe dejar PTYs invisibles. Si era la última
 * hoja del slot, la raíz desaparece → el PanelLayout deja de renderizarlo;
 * si era una hoja de un split, el split colapsa al hermano.
 *
 * Diferencia clave con un slot VACÍO: ocultar usa removeStrip (el strip
 * desaparece del store → no se renderiza). Un slot vacío (p.ej. se arrastró
 * la última tab a otro lado) conserva el strip con 0 tabs → el placeholder
 * "Slot vacío" con su zona de drop.
 */
function hideStripWithSessions(stripId: string): void {
  const strip = tabsStore.getStrip(stripId)
  strip?.tabs.forEach((tab) => {
    if (tab.kind === 'terminal' && tab.sessionId) destroyTerminalSession(tab.sessionId)
  })
  splitTreeStore.removeStrip(stripId)
}

/** OCULTA UN SLOT COMPLETO: poda todas sus hojas (toggle off de visibilidad). */
function hideSlot(slot: SlotId): void {
  for (const stripId of splitTreeStore.leavesOf(slot)) {
    hideStripWithSessions(stripId)
  }
}

/** Muestra el centro (toggle on / se abrió un archivo). */
export function showCenter(): void {
  centerSuppressed = false
  ensureCenter()
}

/**
 * Reconciliación archivos ↔ tabs: cada archivo abierto en editorBus tiene
 * exactamente una tab (por defecto en el centro). Si el archivo se cerró,
 * la tab se elimina de donde esté y su sesión se destruye.
 */
export function reconcileFileTabs(): void {
  const { openFiles, activePath } = getEditorFiles()

  // 1) Tabs de archivo cuyo archivo ya no está abierto → cerrar + destruir.
  for (const slot of SLOTS) {
    const strip = tabsStore.getStrip(slot)
    if (!strip) continue
    for (const tab of [...strip.tabs]) {
      if (tab.kind !== 'file' || !tab.filePath) continue
      if (!openFiles.some((f) => f.path === tab.filePath)) {
        destroyFileSession(tab.filePath)
        tabsStore.closeTab(slot, tab.id)
      }
    }
  }

  // 2) Archivos abiertos sin tab en ningún strip → spawn en el centro.
  // Si el usuario ocultó el centro (toggle), se RESPETA: las sesiones
  // siguen vivas y sus tabs se restauran al volver a mostrarlo — pero el
  // reconcile no debe revivir el slot (bug: pisaba centerSuppressed y el
  // centro reaparecía al instante, con la tab desactivada).
  const needsCenter =
    !centerSuppressed &&
    openFiles.some((file) => !findFileTab(file.path))
  if (needsCenter) {
    ensureCenter()
  }
  if (!centerSuppressed) {
    for (const file of openFiles) {
      if (findFileTab(file.path)) continue
      const spec: TabSpec = {
        id: `file:${file.path}`,
        kind: 'file',
        filePath: file.path,
        label: file.name,
        closable: true,
        persist: true
      }
      tabsStore.spawnTab('center', spec, { activate: false })
    }
  }

  // 3) El archivo activo queda activo en su strip (restore de focus).
  if (activePath) {
    const located = findFileTab(activePath)
    if (located) {
      tabsStore.activateTab(located.stripId, located.tabId)
    }
  } else if (centerSuppressed) {
    // Sin archivo activo y centro oculto: no forzar nada.
  } else {
    // Sin archivo activo: si la tab activa del centro es un archivo que ya
    // no es el activo, dejar la bienvenida en foco.
    const center = tabsStore.getStrip('center')
    if (center?.activeId?.startsWith('file:')) {
      const active = center.tabs.find((t) => t.id === center.activeId)
      if (active && (!active.filePath || active.filePath !== activePath)) {
        ensureCenter()
        tabsStore.activateTab('center', 'welcome')
      }
    }
  }
}

/**
 * Reordena openFiles tras un reorder de tabs en el centro (persistencia):
 * el orden canónico de los archivos lo define el strip central.
 */
export function syncEditorFileOrderFromCenter(): void {
  const center = tabsStore.getStrip('center')
  if (!center) return
  const paths = center.tabs
    .filter((t) => t.kind === 'file' && t.filePath)
    .map((t) => t.filePath as string)
  if (paths.length === 0) return
  reorderOpenFilesTo(paths)
}

// ── API legacy (un panel por slot) ─────────────────────────────────────────

/**
 * setSlotPanel legacy: centro = mostrar/ocultar welcome/editor/panel;
 * laterales = abrir el panel (append multi-tab). null = ocultar el slot.
 */
export function setSlotPanel(slot: SlotId, panelId: PanelId | null): void {
  if (slot === 'center') {
    if (panelId === null) {
      hideCenter()
      return
    }
    if (panelId === 'welcome') {
      ensureCenter()
      tabsStore.activateTab('center', 'welcome')
      clearActiveFile()
      return
    }
    if (panelId === 'editor') {
      const { activePath } = getEditorFiles()
      if (activePath) {
        const located = findFileTab(activePath)
        if (located) {
          ensureCenter()
          tabsStore.activateTab(located.stripId, located.tabId)
          return
        }
        // Archivo activo sin tab (edge): se re-abre.
        const file = getEditorFiles().openFiles.find((f) => f.path === activePath)
        if (file) {
          openFileTabInCenter(file)
          return
        }
      }
      ensureCenter()
      tabsStore.activateTab('center', 'welcome')
      return
    }
    openPanelTab('center', panelId)
    return
  }
  if (panelId === null) {
    hideSlot(slot)
    return
  }
  openPanelTab(slot, panelId)
}

function openFileTabInCenter(file: EditorFileTab): void {
  ensureCenter()
  const spec: TabSpec = {
    id: `file:${file.path}`,
    kind: 'file',
    filePath: file.path,
    label: file.name,
    closable: true,
    persist: true
  }
  tabsStore.spawnTab('center', spec)
  activateFile(file.path)
}

/**
 * Cierra la tab como lo hace un TOGGLE (botón de ActivityBar / LayoutToggles /
 * comandos): si era la última del slot, el slot se desactiva por completo
 * (removeStrip + destrucción de sesiones). Un slot vacío por drag-out o por la
 * X de la tab conserva el placeholder "Slot vacío".
 */
function closeTabAndHideIfLast(stripId: StripId, tab: TabSpec): void {
  closeTabSmart(stripId, tab)
  const strip = tabsStore.getStrip(stripId)
  if (strip && strip.tabs.length === 0) hideStripWithSessions(stripId)
}

/**
 * Reemplaza la tab de panel ACTIVA del slot por `panelId`, en el mismo índice.
 *
 * La activity bar es "UN panel por slot": abrir Búsqueda con el Explorador
 * abierto lo REEMPLAZA. Sin esto se apilaba una tab nueva y el slot cambiaba
 * a la presentación de tabs (el usuario veía Explorador + Búsqueda), que es
 * justo lo que no se quiere de un botón de la barra.
 *
 * Sólo reemplaza tabs de PANEL: si la tab activa es un archivo o una terminal
 * (sesión viva), devuelve false y el caller spawnea normal — nunca se cierra
 * una sesión por tocar la activity bar.
 */
function swapActivePanel(slot: SlotId, panelId: PanelId): boolean {
  for (const stripId of splitTreeStore.leavesOf(slot)) {
    const strip = tabsStore.getStrip(stripId)
    if (!strip?.activeId) continue
    const active = strip.tabs.find((tab) => tab.id === strip.activeId)
    if (!active || active.kind !== 'panel') continue
    const index = strip.tabs.findIndex((tab) => tab.id === active.id)
    // Cerrar + spawnear en el MISMO índice: dos emisiones síncronas que React
    // agrupa en un solo render (no se ve el slot vacío en el medio).
    tabsStore.closeTab(stripId, active.id)
    tabsStore.spawnTab(stripId, panelTab(panelId, panelLabel(panelId)), { index })
    return true
  }
  return false
}

/**
 * toggleSlotPanel legacy: si la tab del panel existe la cierra (y si era la
 * única, desactiva el slot); si no, la abre EN SU LUGAR (reemplaza el panel
 * que se está viendo, no apila tabs). En el centro, welcome/editor alternan la
 * visibilidad completa.
 */
export function toggleSlotPanel(slot: SlotId, panelId: PanelId): void {
  if (slot === 'center' && (panelId === 'welcome' || panelId === 'editor')) {
    // Busca en TODAS las hojas del centro (puede estar partido en splits).
    const leaves = splitTreeStore.leavesOf('center')
    const hasWelcome = leaves.some((id) =>
      tabsStore.getStrip(id)?.tabs.some((t) => t.kind === 'welcome')
    )
    const hasFiles = leaves.some((id) =>
      tabsStore.getStrip(id)?.tabs.some((t) => t.kind === 'file')
    )
    if (hasWelcome || hasFiles) {
      hideCenter()
    } else {
      showCenter()
      const { activePath } = getEditorFiles()
      if (activePath) {
        const located = findFileTab(activePath)
        if (located) tabsStore.activateTab(located.stripId, located.tabId)
      }
    }
    return
  }
  if (panelId === TERMINAL_PANEL_ID) {
    toggleTerminalTab(slot)
    return
  }
  const id = `panel:${panelId}`
  // Busca en TODAS las hojas del slot (el panel puede vivir en un split).
  const leaves = splitTreeStore.leavesOf(slot)
  for (const stripId of leaves) {
    const strip = tabsStore.getStrip(stripId)
    if (strip?.tabs.some((t) => t.id === id)) {
      const tab = strip.tabs.find((t) => t.id === id)!
      closeTabAndHideIfLast(stripId, tab)
      return
    }
  }
  // No está abierto: ocupa el lugar del panel que se está viendo.
  if (swapActivePanel(slot, panelId)) return
  openPanelTab(slot, panelId)
}

function toggleTerminalTab(slot: SlotId): void {
  const leaves = splitTreeStore.leavesOf(slot)
  const terminals: TabSpec[] = []
  let lastStrip: StripId | null = null
  for (const stripId of leaves) {
    const strip = tabsStore.getStrip(stripId)
    if (!strip) continue
    for (const tab of strip.tabs) {
      if (tab.kind === 'terminal') {
        terminals.push(tab)
        lastStrip = stripId
      }
    }
  }
  if (terminals.length > 0) {
    const last = terminals[terminals.length - 1]
    closeTabAndHideIfLast(lastStrip ?? slot, last)
  } else {
    openTerminalTab(slot)
  }
}

/**
 * Ícono decorativo por kind (para los strips de tabs).
 * - Bienvenida = Home, archivos = TEMA ACTIVO de fileIcons (data URI → <img>)
 *   con fallback a File genérico, paneles = ícono declarado en centerTabs.
 */
export function tabIconFor(tab: TabSpec): ComponentType<{ size?: number }> | undefined {
  if (tab.icon) return tab.icon
  switch (tab.kind) {
    case 'welcome':
      return HOME_ICON
    case 'file': {
      if (tab.filePath) {
        const base = tab.filePath.split(/[/\\]/).pop() ?? tab.filePath
        const url = getFileIconUrl(base, { path: tab.filePath })
        if (url) return fileIconImageComponent(url)
      }
      return FILE_ICON
    }
    case 'panel': {
      const declared = ExtensionRegistry.getCenterTabs().find(
        (ct) => ct.id === tab.panelId || ct.panelId === tab.panelId
      )
      return declared?.icon
    }
    case 'terminal':
      return undefined
    case 'explorer':
      return FOLDER_ICON
  }
}
