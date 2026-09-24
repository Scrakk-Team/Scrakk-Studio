// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Ejecutor de los comandos BUILT-IN de VS Code (lado UI).
 *
 * La tabla (qué se puede y qué no) vive en
 * `@shared/compatibility/vscode/commands/builtin` — DATA pura. Aquí está lo que
 * esa tabla NO puede vivir sin: el código que toca los servicios reales del
 * IDE (layout, editor, ajustes, workspace).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DOS ENTRADAS, UNA RESOLUCIÓN
 *
 *  1. La PALETA y los atajos: se registran como comandos del IDE con el id de
 *     VS Code, así aparecen y se pueden ejecutar (`runCommand`).
 *  2. La EXTENSIÓN: `vscode.commands.executeCommand('workbench.action.…')`
 *     viaja host → main → renderer (`command/execute`, con ARGS) y se resuelve
 *     aquí con `runVSCodeCommand`. Los args importan: `vscode.open` recibe la
 *     URI, `workbench.view.extension` el contenedor.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ PASA CUANDO NO HAY RUTA
 *
 * El comando NO se registra y `runVSCodeCommand` devuelve `false`; el puente
 * arma entonces el error con el motivo declarado en la tabla
 * (`commandUnavailableReason`). Un comando desconocido dice "no existe"; uno
 * declarado sin equivalente dice POR QUÉ no está. Ninguna de las dos es muda.
 */

import { commandRegistry, runCommand } from '@services/commands'
import { getEditorFiles, openFileInEditor, saveFileByPath } from '@features/editor'
import { setWorkspaceRoot } from '@features/explorer'
import {
  closeTabSmart,
  openNewTerminalTab,
  openPanelTab,
  openTerminalTab
} from '@features/layout'
import { tabsStore } from '@features/tabs'
import { getOrderedButtons } from '@features/activitybar'
import { parseViewPanelId } from '@features/extensionviews/ids'
import type { SettingsSectionId } from '@features/settings'
import {
  BUILTIN_VSCODE_COMMANDS,
  builtinCommand,
  type BuiltinHandlerKey
} from '@shared/compatibility/vscode/commands/builtin'
import { argToPath, baseNameOfPath } from '@shared/compatibility/vscode/commands/args'

/** Prefijo con el que VS Code auto-genera el id de un contenedor. */
const VIEW_EXTENSION_PREFIX = 'workbench.view.extension.'

// ── Tab del panel activo (para `closePanel`) ───────────────────────────────

/**
 * Cierra el panel activo. Prioridad: la terminal activa (el panel inferior de
 * VS Code es justo eso), y si no hay, la tab activa que NO sea archivo ni
 * Bienvenida (terminal o panel) — nunca un archivo: cerrarlo pide guardar y
 * esa decisión no la toma la extensión.
 */
function closeActivePanel(): boolean {
  const strips = Object.values(tabsStore.getAll())
  const activeOf = (kind: string): { stripId: string; tabId: string } | null => {
    for (const strip of strips) {
      const tab = strip.tabs.find((candidate) => candidate.id === strip.activeId)
      if (tab && tab.kind === kind) return { stripId: strip.stripId, tabId: tab.id }
    }
    return null
  }
  const target =
    activeOf('terminal') ?? activeOf('panel') ?? (() => null)()
  if (!target) return false
  const strip = tabsStore.getStrip(target.stripId)
  const tab = strip?.tabs.find((candidate) => candidate.id === target.tabId)
  if (!strip || !tab) return false
  closeTabSmart(strip.stripId, tab)
  return true
}

// ── Handlers ───────────────────────────────────────────────────────────────

/**
 * Implementación por acción declarada. El tipo lo fuerza: si la tabla agrega
 * una `BuiltinHandlerKey` nueva, esto deja de compilar hasta implementarla.
 */
const HANDLERS: Record<BuiltinHandlerKey, (args: unknown[]) => void | Promise<void>> = {
  'settings.open': (args) => {
    // VS Code recibe la query de búsqueda (`@ext:pub.nombre` cuando el botón
    // viene de la notificación de una extensión). Scrakk no tiene buscador de
    // ajustes todavía: si la query nombra una extensión, se entra a esa
    // sección; cualquier otra query abre Ajustes en su sección por defecto.
    const query = typeof args[0] === 'string' ? args[0] : ''
    const section: SettingsSectionId | undefined = query.includes('@ext:')
      ? 'extensions'
      : undefined
    window.dispatchEvent(new CustomEvent('open-settings', { detail: { section } }))
  },

  'window.reload': () => {
    // Reload del renderer: el shell, los paneles y los hosts de extensión
    // vuelven a arrancar, que es lo que la extensión espera de `reloadWindow`.
    window.location.reload()
  },

  'terminal.focus': () => {
    openTerminalTab('bottom')
  },

  'terminal.new': () => {
    openNewTerminalTab('bottom')
  },

  'panel.close': () => {
    if (!closeActivePanel()) {
      throw new Error('no hay ningún panel abierto para cerrar')
    }
  },

  'view.container.reveal': (args) => {
    const wanted = typeof args[0] === 'string' ? args[0] : ''
    if (wanted.length === 0) {
      throw new Error('workbench.view.extension necesita el id del contenedor')
    }
    const sides = ['left', 'right'] as const
    for (const side of sides) {
      for (const button of getOrderedButtons(side)) {
        const parsed = parseViewPanelId(button.panelId)
        if (!parsed) continue
        // El id del contenedor puede venir completo o con el prefijo que VS
        // Code genera (`workbench.view.extension.<id>`).
        if (parsed.containerId === wanted || parsed.containerId === wanted.replace(VIEW_EXTENSION_PREFIX, '')) {
          openPanelTab(button.side, button.panelId)
          return
        }
      }
    }
    throw new Error(`no hay ningún panel de extensión para el contenedor "${wanted}"`)
  },

  'file.open': (args) => {
    const path = argToPath(args[0])
    if (!path) {
      throw new Error(
        'vscode.open necesita la URI del archivo (llegó un argumento sin path de disco)'
      )
    }
    openFileInEditor(path, baseNameOfPath(path))
  },

  'file.openWith': (args) => {
    const path = argToPath(args[0])
    if (!path) {
      throw new Error('vscode.openWith necesita la URI del archivo')
    }
    // El editor pedido se ignora: Scrakk abre con su editor nativo. Se dice en
    // el log en vez de fingir que se respetó.
    if (typeof args[1] === 'string' && args[1] !== 'default') {
      console.info(`[compat] vscode.openWith: se ignora el editor "${args[1]}"`)
    }
    openFileInEditor(path, baseNameOfPath(path))
  },

  'folder.open': async (args) => {
    const path = argToPath(args[0])
    if (path) {
      setWorkspaceRoot(path)
      return
    }
    // Sin argumento: la carpeta la elige el usuario, igual que en VS Code.
    const result = await window.api.fs.pickFolder()
    if (result.success && result.path) setWorkspaceRoot(result.path)
  },

  'file.saveAll': async () => {
    const { openFiles } = getEditorFiles()
    if (openFiles.length === 0) return
    for (const file of openFiles) {
      const result = await saveFileByPath(file.path)
      // `SaveResult` usa `ok` (no `success`): con `success` esto tiraba SIEMPRE
      // y `file.saveAll` no guardaba nunca nada.
      if (!result.ok) throw new Error(`no se pudo guardar ${file.path}: ${result.error}`)
    }
  }
}

// ── Resolución ─────────────────────────────────────────────────────────────

/**
 * Corre un comando pedido por una extensión. Devuelve `false` si NADIE lo
 * tiene (ni la tabla de compatibilidad ni el registry del IDE): quien llama
 * decide cómo reportarlo.
 *
 * Los errores de un handler SÍ se propagan: la extensión tiene que ver por qué
 * falló (`vscode.open` sin URI, un contenedor inexistente), no un `false`.
 */
export async function runVSCodeCommand(id: string, args: unknown[] = []): Promise<boolean> {
  const direct = builtinCommand(id)
  if (direct?.handler) {
    await HANDLERS[direct.handler](args)
    return true
  }
  if (direct?.native) return await runCommand(direct.native)

  // `workbench.view.extension.<contenedor>`: id compuesto, no está en la tabla.
  if (id.startsWith(VIEW_EXTENSION_PREFIX)) {
    await HANDLERS['view.container.reveal']([id.slice(VIEW_EXTENSION_PREFIX.length)])
    return true
  }

  // El registry real del IDE (comandos nativos y de otras partes del app).
  return await runCommand(id)
}

/**
 * Registra en el IDE los comandos de la tabla que tienen acción propia.
 *
 * No se registran los que delegan en un comando nativo (ya existen) ni los
 * que no tienen ruta: la paleta no puede ofrecer algo que va a fallar.
 */
export function installVSCodeBuiltinCommands(): () => void {
  const disposers = BUILTIN_VSCODE_COMMANDS.filter(
    (entry) => entry.handler && entry.palette === true
  ).map((entry) =>
    commandRegistry.register(
      {
        id: entry.id,
        title: entry.label,
        category: 'VS Code',
        run: () => {
          void runVSCodeCommand(entry.id)
        }
      },
      { allowOverwrite: true }
    )
  )
  return () => disposers.forEach((dispose) => dispose())
}
