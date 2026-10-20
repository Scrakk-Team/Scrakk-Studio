// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useState } from 'react'
import { t, useLocale } from '@core/i18n'
import { AppShell } from '@layout/AppShell'
import { ChatsProvider, ToolConfirmationModal, registerChatCommands } from '@features/chat'
import {
  ProvidersProvider
} from '@features/providers'
import {
  LayoutProvider,
  PanelLayout,
  LayoutShortcuts,
  LayoutCommandsBridge,
  CenterFileTabsSync,
  openNewTerminalTab,
  toggleSlotPanel
} from '@features/layout'
import { DragGhost, SplitOverlay } from '@features/dnd'
import { FileViewHeaderBridge } from '@features/fileHandlers/FileViewHeaderBridge'
import { StatusBar } from '@features/statusbar'
import { SettingsModal, openSettingsModal, type SettingsSectionId } from '@features/settings'
import { ActivityBar } from '@features/activitybar'
import { Titlebar } from '@features/titlebar'
import { CommandPalette } from '@features/palette/CommandPalette'
import { OnboardingProvider, OnboardingWizard } from '@features/onboarding'
import { GitCommandsBridge } from '@features/git/GitCommandsBridge'
import { GitDecorationsBridge } from '@features/git/GitDecorationsBridge'
import { LspNotificationsBridge } from '@features/lsp/LspNotificationsBridge'
import { UpdatesBridge } from '@features/updates/UpdatesBridge'
import { skillRegistry } from '@services/skills'
import { startProviderCatalog } from '@services/providers'
import { loadPermissionSettings } from '@services/ai/policy/permissionSettings'
import { loadModeSettings } from '@services/ai/policy/modeSettings'
import { loadAgentSettings } from '@services/ai/agents'
import { commandRegistry, type Command } from '@services/commands'
import { createNewFile, openFilesViaDialog, setWorkspaceRoot } from '@features/explorer'
import { getEditorFiles, requestCloseFile } from '@features/editor'
import { getEditorCursor } from '@features/editor/cursorBus'
import { notify } from '@services/notifications'
import { registerTokenInspectorCommand } from '@features/editor/inspect'
import { captureEditorScreenshot } from '@features/editor/screenshot'
import { saveActiveFile, saveFileByPath } from '@features/editor/save'
import { expandSelectionFromTree } from '@features/editor/treeNavigation'
import {
  goToDefinitionTarget,
  resolveDefinitionTarget
} from '@features/editor/definitionNavigation'
import {
  getMinimapVisible,
  setMinimapVisibleEverywhere
} from '@features/editor/engines/innerta/InnertaEngine'
import { api } from '@services/api'
import { restorePersistedKeymap } from '@services/keybindings'
import { recordWorkspace } from '@services/workspaces'

/**
 * Los proveedores ya no usan modal: abren Ajustes → Chat → Proveedores.
 * El comando global vive en APP_COMMANDS (`providers.open`).
 */

/** Comandos globales que no dependen de contextos React internos. */
const APP_COMMANDS: Command[] = [
  {
    id: 'app.openSettings',
    get title() { return t('app.abrir.ajustes') },
    category: 'Configuración',
    keybinding: 'mod+,',
    run: () => {
      window.dispatchEvent(new CustomEvent('open-settings'))
    }
  },
  {
    id: 'workspace.openFolder',
    get title() { return t('app.abrir.carpeta') },
    category: 'Workspace',
    run: async () => {
      const res = await api.fs.pickFolder()
      if (res.success && res.path) {
        // Igual que el `+` del widget de workspaces: registra en el historial.
        recordWorkspace(res.path)
        setWorkspaceRoot(res.path)
      }
    }
  },
  {
    id: 'workspace.refreshExplorer',
    get title() { return t('app.refrescar.explorador') },
    category: 'Workspace',
    run: () => {
      window.dispatchEvent(new CustomEvent('refresh-explorer'))
    }
  },
  {
    id: 'palette.open',
    get title() { return t('app.paleta.de.comandos') },
    category: 'General',
    run: () => {
      window.dispatchEvent(new CustomEvent('open-command-palette'))
    }
  },
  {
    id: 'file.save',
    get title() { return t('app.guardar.archivo') },
    category: 'Archivo',
    keybinding: 'mod+s',
    run: () => {
      void saveActiveFile()
    }
  },
  {
    id: 'file.new',
    get title() { return t('explorer.nuevo.archivo') },
    category: 'Archivo',
    keybinding: 'mod+n',
    run: () => {
      void createNewFile()
    }
  },
  {
    id: 'file.open',
    get title() { return t('menu.file.openFile') },
    category: 'Archivo',
    keybinding: 'mod+o',
    run: () => {
      void openFilesViaDialog()
    }
  },
  {
    id: 'file.saveAll',
    get title() { return t('app.guardar.todos') },
    category: 'Archivo',
    keybinding: 'mod+alt+s',
    run: () => {
      // Guarda los abiertos con SU encoding/EOL; sin dirty-check propio: el
      // escritor ya compara revisión (ver `saveFileByPath`).
      for (const file of getEditorFiles().openFiles) void saveFileByPath(file.path)
    }
  },
  {
    id: 'terminal.toggle',
    get title() { return t('titlebar.terminal') },
    category: 'Terminal',
    keybinding: 'mod+`',
    run: () => {
      toggleSlotPanel('bottom', 'innerta-terminal')
    }
  },
  {
    id: 'terminal.new',
    get title() { return t('layout.crear.terminal') },
    category: 'Terminal',
    keybinding: 'mod+shift+`',
    run: () => {
      openNewTerminalTab('bottom')
    }
  },
  {
    id: 'layout.toggleSearch',
    get title() { return t('layout.panel.search') },
    category: 'Paneles',
    keybinding: 'mod+shift+f',
    run: () => {
      toggleSlotPanel('left', 'search')
    }
  },
  {
    id: 'layout.toggleProblems',
    get title() { return t('layout.panel.problems') },
    category: 'Paneles',
    keybinding: 'mod+shift+m',
    run: () => {
      toggleSlotPanel('bottom', 'problems')
    }
  },
  {
    id: 'layout.toggleExtensions',
    get title() { return t('layout.panel.extensions') },
    category: 'Paneles',
    keybinding: 'mod+shift+x',
    run: () => {
      toggleSlotPanel('left', 'extensions')
    }
  },
  {
    id: 'view.toggleMinimap',
    get title() { return t('app.alternar.minimapa') },
    category: 'Ver',
    run: () => {
      setMinimapVisibleEverywhere(!getMinimapVisible())
    }
  },
  {
    id: 'providers.open',
    get title() { return t('app.abrir.proveedores.llm') },
    category: 'Configuración',
    run: () => {
      window.dispatchEvent(
        new CustomEvent('open-settings', { detail: { section: 'chatProviders' } })
      )
    }
  }
]

/**
 * Raíz de la app: composición de módulos.
 * - ProvidersProvider: proveedores de LLM detectados + API keys.
 * - ChatsProvider: estado real de conversaciones que comparten el chat
 *   (ChatPanel) y el historial (HistoryPanel).
 * - LayoutProvider: sistema de layouts modular — tres slots (izquierda /
 *   centro / derecha) donde se montan paneles registrados. Nada hardcodeado:
 *   cualquier componente registrado en `features/layout/registry` puede vivir
 *   en cualquier slot.
 * - ActivityBar: barras laterales (izq/der) que activan/desactivan paneles.
 * - StatusBar: barra inferior de estado (proveedor/modelo, contadores, tema,
 *   ajustes).
 */
export function App() {
  // Suscripción al idioma: al cambiarlo, App re-renderiza y con él todo el
  // árbol (los `t()` de los hijos se re-evalúan). Es lo que hace que el IDE
  // entero cambie de idioma sin remontar (no se pierde estado de paneles).
  useLocale()
  // TEMP-ERROR-DEMO (borrar tras probar): crash intencional para ver el
  // AppErrorBoundary. Prender: localStorage.setItem('scrakk:boom','1') + reload.
  if (typeof localStorage !== 'undefined' && localStorage.getItem('scrakk:boom') === '1') {
    throw new Error(t('app.boom.intencional.esto.es.una'))
  }
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId | undefined>()
  // Gear/atajo: siempre Apariencia. Con sección explícita: openSettingsModal(section).
  const openSettings = (): void => {
    setSettingsSection(undefined)
    setSettingsOpen(true)
  }
  const closeSettings = (): void => setSettingsOpen(false)

  // Descubrimiento de skills (.scrakk/skills + extensiones): una vez al
  // arrancar; el registry se mantiene solo con sus watchers.
  useEffect(() => {
    skillRegistry.start()
  }, [])

  // Catálogo de proveedores (models.dev): cache en disco → fetch remoto en
  // cada apertura del editor.
  useEffect(() => {
    startProviderCatalog()
  }, [])

  // Comandos con barra del chat con IA (`/variants`, …).
  useEffect(() => {
    registerChatCommands()
  }, [])

  // Modos propios (`.scrakk/modes.json`) y luego las reglas de permisos
  // (`.scrakk/permissions.json`): el modo por defecto puede ser propio.
  // Después los AGENTES (`.scrakk/agents/*.json`): se registran como modos
  // primarios y como subagentes, y hacen seed del agente default.
  useEffect(() => {
    void loadModeSettings()
      .then(() => loadPermissionSettings())
      .then(() => loadAgentSettings())
  }, [])

  // Registro de comandos globales + listener del modal de ajustes.
  useEffect(() => {
    const unsubs = APP_COMMANDS.map((command) =>
      commandRegistry.register(command, { allowOverwrite: true })
    )
    // Keymap elegido (Scrakk / VS Code / JetBrains). Va DESPUÉS del registro:
    // re-registra los comandos con el combo del preset persistido.
    restorePersistedKeymap()
    const handler = (event: Event): void => {
      const section = (event as CustomEvent<{ section?: SettingsSectionId }>).detail?.section
      setSettingsSection(section)
      setSettingsOpen(true)
    }
    window.addEventListener('open-settings', handler)

    // Cerrar archivo activo vía editorBus (singleton, sin contexto).
    // Pasa por la guardia dirty: no se tira un buffer con cambios callando.
    const unsubClose = commandRegistry.register({
      id: 'editor.closeActiveFile',
      title: 'menu.file.closeFile',
      category: 'Editor',
      keybinding: 'mod+w',
      run: () => {
        const { activePath } = getEditorFiles()
        if (activePath) requestCloseFile(activePath)
      }
    }, { allowOverwrite: true })

    /**
     * “Ir a la definición” con el ÁRBOL primero, LSP después.
     *
     * El orden importa: si el lenguaje tiene `locals.scm`, el árbol resuelve en
     * memoria (sin server, al instante) y —lo importante— respeta ÁMBITOS, así
     * que `x` va al parámetro de la función y no a la primera `x` del archivo.
     * Si no hay árbol, el LSP es la respuesta correcta; y si tampoco hay LSP,
     * se avisa en vez de no hacer nada.
     */
    const unsubDefinition = commandRegistry.register(
      {
        id: 'editor.goToDefinition',
        title: 'app.ir.a.la.definicion',
        category: 'Editor',
        keybinding: 'f12',
        run: () => {
          void (async () => {
            const { activePath } = getEditorFiles()
            const cursor = getEditorCursor()
            if (!activePath || !cursor) return
            const target = await resolveDefinitionTarget(activePath, {
              line: cursor.line,
              col: cursor.col
            })
            if (!target) {
              notify({
                title: t('app.ir.a.la.definicion'),
                message: t('app.sin.definicion.en.el.cursor'),
                severity: 'info'
              })
              return
            }
            goToDefinitionTarget(target)
          })()
        }
      },
      { allowOverwrite: true }
    )

    // Expandir selección con los rangos REALES del árbol (textobjects.scm).
    const unsubExpand = commandRegistry.register(
      {
        id: 'editor.expandSelection',
        title: 'app.expandir.seleccion.objeto.de.texto',
        category: 'Editor',
        keybinding: 'shift+alt+right',
        run: () => void expandSelectionFromTree()
      },
      { allowOverwrite: true }
    )

    // Inspección de tokens: el panel que explica de dónde salió el color.
    const unsubInspect = registerTokenInspectorCommand()
    // Captura del editor: PNG de lo que se está viendo (el main lo compone,
    // porque el canvas de Innerta es WebGL y no se puede leer del renderer).
    const unsubCapture = commandRegistry.register(
      {
        id: 'editor.captureScreenshot',
        title: 'app.capturar.el.editor.png',
        category: 'Editor',
        run: () => void captureEditorScreenshot()
      },
      { allowOverwrite: true }
    )

    return () => {
      unsubs.forEach((unsub) => unsub())
      unsubClose()
      unsubDefinition()
      unsubExpand()
      unsubInspect()
      unsubCapture()
      window.removeEventListener('open-settings', handler)
    }
  }, [])

  // Comando LSP: abre Ajustes directo en la zona de servers.
  useEffect(() => {
    const unsub = commandRegistry.register({
      id: 'lsp.openModal',
      title: 'app.language.servers',
      category: 'Configuración',
      run: () => openSettingsModal('servers')
    })
    return unsub
  }, [])

  return (
    <ProvidersProvider>
      <ChatsProvider>
        {/* Configuración inicial: el provider va arriba del shell para que el
            wizard (montado adentro, junto a los demás hosts) pueda usar los
            modales/notificaciones y el resto de la app siga funcionando. */}
        <OnboardingProvider>
          <AppShell>
            <LayoutProvider>
              <LayoutShortcuts />
              <LayoutCommandsBridge />
              <GitCommandsBridge />
              <GitDecorationsBridge />
              {/* Archivos abiertos (editorBus) ↔ tabs del centro. */}
              <CenterFileTabsSync />
              {/* Ojo visor ⇄ editor en la tab del archivo activo. */}
              <FileViewHeaderBridge />
              <Titlebar onOpenSettings={openSettings} />
              <div className="app-workspace">
                <ActivityBar side="left" />
                <PanelLayout />
                <ActivityBar side="right" />
              </div>
              <StatusBar onOpenSettings={openSettings} />
              {/* Ghost del drag & drop de tabs + overlay del split direccional. */}
              <DragGhost />
              <SplitOverlay />
            </LayoutProvider>
            {/* Confirmaciones del policy engine (tools de mutación/riesgo). */}
            <ToolConfirmationModal />
            <SettingsModal
              open={settingsOpen}
              onClose={closeSettings}
              initialSection={settingsSection}
            />
            <LspNotificationsBridge />
            <UpdatesBridge />
            <CommandPalette />
            {/* Configuración inicial: se muestra sola en el primer arranque y
                se reabre con el comando "Ver configuración inicial". */}
            <OnboardingWizard />
          </AppShell>
        </OnboardingProvider>
      </ChatsProvider>
    </ProvidersProvider>
  )
}
