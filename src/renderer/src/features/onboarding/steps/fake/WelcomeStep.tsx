// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Paso 1 — Bienvenida. FAKE: no toca ningún servicio.
 *
 * Los datos son de mentira (a propósito): sirven para ver la pantalla real
 * con contenido verosímil antes de que exista la fuente que los llene.
 * Cuando el paso pase a real se le inyecta un origen de datos; la forma del
 * componente no cambia.
 */

import type { JSX } from 'react'
import { CardGrid, Lead, OptionCard, SectionLabel, Stack } from '../kit'

/** Datos DEMO de este paso (maqueta). */
const DEMO_SESSION = {
  greeting: 'Hola 👋',
  line: 'Tu editor ya está listo. Antes de arrancar, unos ajustes rápidos: dos se aplican en el momento y dos son solo una vista previa de lo que viene.',
  highlights: [
    {
      id: 'editor',
      icon: 'code',
      title: 'Editor con Innerta',
      description: 'Resaltado, minimapa y símbolos sobre el mismo motor.'
    },
    {
      id: 'terminal',
      icon: 'terminal',
      title: 'Terminal real',
      description: 'PTY nativo con sesiones persistentes y splits.'
    },
    {
      id: 'extensions',
      icon: 'extensions',
      title: 'Extensiones',
      description: 'Temas, paneles y compatibilidad con extensiones de VS Code.'
    },
    {
      id: 'workspaces',
      icon: 'layers',
      title: 'Layout libre',
      description: 'Cada panel se mueve, se divide y se guarda por workspace.'
    }
  ]
} as const

export function WelcomeStep(): JSX.Element {
  return (
    <Stack gap={4}>
      <Stack gap={3}>
        <SectionLabel>{DEMO_SESSION.greeting}</SectionLabel>
        <Lead>{DEMO_SESSION.line}</Lead>
      </Stack>
      <CardGrid>
        {DEMO_SESSION.highlights.map((item) => (
          <OptionCard key={item.id} icon={item.icon} title={item.title} description={item.description} />
        ))}
      </CardGrid>
    </Stack>
  )
}
