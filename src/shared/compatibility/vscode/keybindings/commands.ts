// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Comandos de VS Code → comandos de Scrakk — DATA, sin lógica.
 *
 * Es el destino de una importación de `keybindings.json`: una combinación solo
 * sirve si el comando al que apunta EXISTE en este IDE. Lo que no está acá se
 * reporta como "sin comando" (nunca se inventa un handler).
 *
 * Criterio: solo comandos que ya existen en `commandRegistry` y cuya acción es
 * equivalente. Las acciones internas del editor (`editor.action.*`, debug,
 * tasks) no están: dependen del motor del editor, no de un comando.
 */

export const VSCODE_KEYBINDING_COMMANDS: Readonly<Record<string, string>> = {
  // Archivo
  'workbench.action.files.save': 'file.save',
  'workbench.action.files.saveAll': 'file.saveAll',
  'workbench.action.files.newUntitledFile': 'file.new',
  'workbench.action.files.openFile': 'file.open',
  'workbench.action.closeActiveEditor': 'editor.closeActiveFile',

  // General / configuración
  'workbench.action.showCommands': 'palette.open',
  'workbench.action.openSettings': 'app.openSettings',
  'workbench.action.selectTheme': 'theme.cycle',

  // Terminal
  'workbench.action.terminal.toggleTerminal': 'terminal.toggle',
  'workbench.action.terminal.new': 'terminal.new',

  // Paneles / vistas
  'workbench.view.explorer': 'layout.toggleExplorer',
  'workbench.view.search': 'layout.toggleSearch',
  'workbench.view.extensions': 'layout.toggleExtensions',
  'workbench.actions.view.problems': 'layout.toggleProblems',
  'workbench.view.scm': 'git.panel',
  'workbench.action.chat.open': 'layout.toggleChat'
}
