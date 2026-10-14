// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del puente de runtime de los bundles `.sef`
 * (`services/extensions/runtime/bridge.ts`).
 *
 * Es la vía por la que una extensión DECLARATIVA (sin Extension Host) aporta
 * comandos a la paleta y atiende los tools de IA que declara en el manifest.
 * Lo que se prueba acá: el namespace por dueño, que la paleta los vea, que se
 * despachen args y que la baja no deje comandos fantasma.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { commandRegistry } from '../src/renderer/src/services/commands/registry'
import {
  withExtensionOwner,
  registerPaletteCommand,
  registerToolHandler,
  getToolHandler,
  disposeRuntimeHandlers
} from '../src/renderer/src/services/extensions/runtime/bridge'

const OWNER = 'canvas'
const OTHER = 'otra-extension'

function clearRegistry(): void {
  for (const command of commandRegistry.list()) commandRegistry.unregister(command.id)
}

describe('puente de runtime de extensiones', () => {
  beforeEach(() => {
    clearRegistry()
    disposeRuntimeHandlers(OWNER)
    disposeRuntimeHandlers(OTHER)
  })

  it('registra un comando de paleta en nombre del dueño, con namespace', async () => {
    const ran: string[] = []
    await withExtensionOwner(OWNER, async () => {
      registerPaletteCommand({
        id: 'clear',
        title: 'Canvas: vaciar el lienzo',
        run: () => {
          ran.push('clear')
        }
      })
    })

    const registered = commandRegistry.get(`${OWNER}:clear`)
    expect(registered).not.toBeNull()
    expect(registered?.title).toBe('Canvas: vaciar el lienzo')

    // La paleta corre el comando registrado.
    await registered?.run()
    expect(ran).toEqual(['clear'])
  })

  it('el dueño de un tool es quien lo registró (no lo ve otra extensión)', async () => {
    const draw = vi.fn((args: unknown) => `ok ${JSON.stringify(args)}`)
    await withExtensionOwner(OWNER, async () => {
      registerToolHandler('canvas.draw', draw)
    })

    const handler = getToolHandler(OWNER, 'canvas.draw')
    expect(handler).not.toBeNull()
    // Otro paquete con el MISMO command no lo pisa: la clave incluye el dueño.
    expect(getToolHandler(OTHER, 'canvas.draw')).toBeNull()

    const result = await handler?.({ kind: 'circle' })
    expect(result).toBe('ok {"kind":"circle"}')
    expect(draw).toHaveBeenCalledWith({ kind: 'circle' })
  })

  it('desregistrar deja limpia la paleta y los handlers', async () => {
    await withExtensionOwner(OWNER, async () => {
      registerPaletteCommand({ id: 'abrir', title: 'Canvas: abrir', run: () => {} })
      registerToolHandler('canvas.draw', () => 'x')
    })
    expect(commandRegistry.get(`${OWNER}:abrir`)).not.toBeNull()
    expect(getToolHandler(OWNER, 'canvas.draw')).not.toBeNull()

    disposeRuntimeHandlers(OWNER)

    expect(commandRegistry.get(`${OWNER}:abrir`)).toBeNull()
    expect(getToolHandler(OWNER, 'canvas.draw')).toBeNull()
  })

  it('sin dueño no registra nada (el contrato es el top-level del bundle)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      registerPaletteCommand({ id: 'tarde', title: 'Tarde', run: () => {} })
      registerToolHandler('canvas.draw', () => 'x')
      expect(commandRegistry.get(`${OWNER}:tarde`)).toBeNull()
      expect(getToolHandler(OWNER, 'canvas.draw')).toBeNull()
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})
