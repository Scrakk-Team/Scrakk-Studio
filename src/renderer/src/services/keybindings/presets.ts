// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Keymaps de otras IDEs — DATA, sin lógica.
 *
 * El motor de atajos ya existe (`services/shortcuts`) y cada comando declara su
 * `keybinding` (ver `services/commands`). Lo que agrega este módulo es poder
 * **re-mapear** esos combos según la IDE de la que venga el usuario: elegir un
 * preset cambia el `keybinding` de los comandos, sin tocar código ni duplicar
 * acciones.
 *
 * Reglas de esta tabla:
 *  - Solo `win`/`linux` (Scrakk no soporta macOS): nada de `meta`/`⌘`.
 *  - Sin chords: el motor matchea un combo por evento (`ctrl+k ctrl+s` no existe).
 *    Cuando el preset original usa una secuencia se elige el equivalente de UN
 *    combo y se anota en `note`.
 *  - `key: null` = dejar el comando sin atajo (la IDE original no tiene uno
 *    razonable que no sea un chord).
 *  - Si un comando no existe (todavía), `applyKeymap` lo reporta en `missing`.
 */

export type KeymapPresetId = 'scrakk' | 'vscode' | 'jetbrains'

export interface KeymapBinding {
  /** Id de comando del registry (`file.save`, `terminal.toggle`, …). */
  command: string
  /** Combo estilo `mod+shift+p` o `null` para dejarlo sin atajo. */
  key: string | null
  /** Aclaración cuando el original era un chord / no hay equivalente exacto. */
  note?: string
}

export interface KeymapPreset {
  label: string
  /** Cómo se llama la IDE, para la UI. */
  source: string
  bindings: KeymapBinding[]
}

export const KEYMAP_PRESETS: Record<KeymapPresetId, KeymapPreset> = {
  scrakk: {
    label: 'Scrakk',
    source: 'Scrakk Studio',
    bindings: [
      { command: 'app.openSettings', key: 'mod+,' },
      { command: 'palette.open', key: 'mod+shift+p' },
      { command: 'file.new', key: 'mod+n' },
      { command: 'file.open', key: 'mod+o' },
      { command: 'workspace.openFolder', key: 'mod+shift+o' },
      { command: 'file.save', key: 'mod+s' },
      { command: 'file.saveAll', key: 'mod+alt+s' },
      { command: 'editor.closeActiveFile', key: 'mod+w' },
      { command: 'terminal.toggle', key: 'mod+`' },
      { command: 'terminal.new', key: 'mod+shift+`' },
      { command: 'layout.toggleExplorer', key: 'mod+b' },
      { command: 'layout.toggleChat', key: 'mod+j' },
      { command: 'layout.toggleHistory', key: 'mod+alt+h' },
      { command: 'layout.toggleSearch', key: 'mod+shift+f' },
      { command: 'layout.toggleProblems', key: 'mod+shift+m' },
      { command: 'layout.toggleExtensions', key: 'mod+shift+x' },
      { command: 'git.panel', key: 'mod+shift+g' },
      { command: 'theme.cycle', key: 'mod+alt+t' }
    ]
  },
  vscode: {
    label: 'VS Code',
    source: 'Visual Studio Code (Windows/Linux)',
    bindings: [
      { command: 'app.openSettings', key: 'mod+,' },
      { command: 'palette.open', key: 'mod+shift+p' },
      { command: 'file.new', key: 'mod+n' },
      { command: 'file.open', key: 'mod+o' },
      // VS Code: Ctrl+K Ctrl+O (chord) → equivalente de un combo.
      { command: 'workspace.openFolder', key: 'mod+shift+o', note: 'Ctrl+K Ctrl+O es un chord' },
      { command: 'file.save', key: 'mod+s' },
      // VS Code: Ctrl+K S (chord).
      { command: 'file.saveAll', key: 'mod+alt+s', note: 'Ctrl+K S es un chord' },
      { command: 'editor.closeActiveFile', key: 'mod+w' },
      { command: 'terminal.toggle', key: 'mod+`' },
      { command: 'terminal.new', key: 'mod+shift+`' },
      { command: 'layout.toggleExplorer', key: 'mod+b' },
      { command: 'layout.toggleSearch', key: 'mod+shift+f' },
      { command: 'layout.toggleProblems', key: 'mod+shift+m' },
      { command: 'layout.toggleExtensions', key: 'mod+shift+x' },
      { command: 'git.panel', key: 'mod+shift+g' }
    ]
  },
  jetbrains: {
    label: 'JetBrains',
    source: 'IntelliJ IDEA / WebStorm',
    bindings: [
      { command: 'app.openSettings', key: 'ctrl+alt+s' },
      { command: 'palette.open', key: 'mod+shift+a' },
      { command: 'file.open', key: 'mod+shift+n' },
      { command: 'workspace.openFolder', key: null, note: 'JetBrains abre el proyecto, no la carpeta' },
      { command: 'file.save', key: 'mod+s' },
      { command: 'file.saveAll', key: 'mod+shift+s' },
      { command: 'editor.closeActiveFile', key: 'ctrl+f4' },
      { command: 'terminal.toggle', key: 'alt+f12' },
      { command: 'terminal.new', key: 'alt+shift+f12' },
      { command: 'layout.toggleExplorer', key: 'alt+1' },
      { command: 'layout.toggleProblems', key: 'alt+6' },
      { command: 'git.panel', key: 'alt+9' },
      { command: 'layout.toggleSearch', key: 'mod+shift+f' }
    ]
  }
}

export const KEYMAP_PRESET_IDS = Object.keys(KEYMAP_PRESETS) as KeymapPresetId[]
