// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Paso 4 — Atajos. FAKE: solo UI.
 *
 * Los cuatro perfiles y sus combinaciones son de mentira: sirven para ver
 * cómo va a quedar el selector cuando el motor de keymaps exista. La
 * elección NO se persiste (guardar algo que nada consume sería mentir) y el
 * paso lo dice con una nota.
 *
 * Cuando pase a real: importar el servicio de keymaps y reemplazar el
 * `setChoice` local por la aplicación real. Nada más cambia.
 */

import { useEffect, type JSX } from 'react'
import type { StepContext } from '../../types'
import {
  CardGrid,
  OptionCard,
  PreviewNote,
  SectionLabel,
  ShortcutList,
  ShortcutRow,
  Stack
} from '../kit'

/** Perfil que arranca marcado (el actual del editor). */
const DEFAULT_PROFILE_ID = 'scrakk'

interface DemoShortcut {
  action: string
  keys: string[]
}

interface DemoProfile {
  id: string
  title: string
  description: string
  badge?: string
  shortcuts: DemoShortcut[]
}

/** Perfiles DEMO (maqueta). */
const DEMO_PROFILES: DemoProfile[] = [
  {
    id: 'scrakk',
    title: 'Scrakk',
    description: 'Los atajos del editor tal como vienen.',
    badge: 'Actual',
    shortcuts: [
      { action: 'Paleta de comandos', keys: ['Ctrl', 'Shift', 'P'] },
      { action: 'Buscar archivo', keys: ['Ctrl', 'P'] },
      { action: 'Guardar', keys: ['Ctrl', 'S'] },
      { action: 'Terminal', keys: ['Ctrl', 'Ñ'] }
    ]
  },
  {
    id: 'vscode',
    title: 'VS Code',
    description: 'Los mismos atajos que ya venías usando.',
    shortcuts: [
      { action: 'Paleta de comandos', keys: ['Ctrl', 'Shift', 'P'] },
      { action: 'Buscar archivo', keys: ['Ctrl', 'P'] },
      { action: 'Guardar', keys: ['Ctrl', 'S'] },
      { action: 'Terminal', keys: ['Ctrl', '`'] }
    ]
  },
  {
    id: 'jetbrains',
    title: 'JetBrains',
    description: 'Esquema de IntelliJ / WebStorm.',
    shortcuts: [
      { action: 'Buscar acción', keys: ['Ctrl', 'Shift', 'A'] },
      { action: 'Buscar archivo', keys: ['Ctrl', 'Shift', 'N'] },
      { action: 'Guardar', keys: ['Ctrl', 'S'] },
      { action: 'Terminal', keys: ['Alt', 'F12'] }
    ]
  },
  {
    id: 'vim',
    title: 'Vim',
    description: 'Modo normal para los que no sueltan hjkl.',
    shortcuts: [
      { action: 'Paleta de comandos', keys: ['Ctrl', 'Shift', 'P'] },
      { action: 'Buscar en archivo', keys: ['/'] },
      { action: 'Guardar', keys: ['Ctrl', 'S'] },
      { action: 'Salir del modo', keys: ['Esc'] }
    ]
  }
]

export function KeymapStep({ choice, setChoice }: StepContext): JSX.Element {
  // La elección guarda el TÍTULO (el wizard lo muestra tal cual en el
  // resumen); el perfil se resuelve por título.
  const selected =
    DEMO_PROFILES.find((profile) => profile.title === choice) ??
    DEMO_PROFILES.find((profile) => profile.id === DEFAULT_PROFILE_ID) ??
    DEMO_PROFILES[0]

  // Preselección: el perfil actual, para que el resumen tenga algo que decir.
  useEffect(() => {
    if (choice === null) setChoice(selected.title)
  }, [choice, selected.title, setChoice])

  return (
    <Stack gap={4}>
      <Stack gap={3}>
        <SectionLabel>Perfil de atajos</SectionLabel>
        <CardGrid>
          {DEMO_PROFILES.map((profile) => (
            <OptionCard
              key={profile.id}
              icon="keyboard"
              title={profile.title}
              description={profile.description}
              badge={profile.badge}
              selected={profile.id === selected.id}
              onSelect={() => setChoice(profile.title)}
            />
          ))}
        </CardGrid>
      </Stack>

      <Stack gap={3}>
        <SectionLabel>Así quedaría «{selected.title}»</SectionLabel>
        <ShortcutList>
          {selected.shortcuts.map((shortcut) => (
            <ShortcutRow key={shortcut.action} action={shortcut.action} keys={shortcut.keys} />
          ))}
        </ShortcutList>
      </Stack>

      <PreviewNote>
        Los perfiles de atajos son una vista previa: todavía no se aplican ni se guardan.
      </PreviewNote>
    </Stack>
  )
}
