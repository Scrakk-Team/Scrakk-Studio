// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Entorno del host: telemetría REAL, `env.shell`, `l10n` y el mapa de
 * comandos built-in de VS Code.
 *
 * Estos cuatro salieron de fallos medidos con extensiones reales (Cline):
 *  - `env.isTelemetryEnabled` hardcodeado en `false` ⇒ la extensión avisa que
 *    el IDE "no coincide" con su configuración.
 *  - `l10n.t` inexistente ⇒ `activate` muere por una cadena de texto.
 *  - `env.shell` ausente ⇒ la extensión no puede ofrecer su integración.
 *  - `workbench.action.*` sin equivalente ⇒ el botón de la notificación
 *    termina en un error opaco.
 */

import { describe, expect, it, vi } from 'vitest'
import { createVscodeApi, substitutePlaceholders } from '../src/main/extensions/host/vscodeApi'
import type { HostBridge } from '../src/main/extensions/host/vscodeShim'
import {
  BUILTIN_VSCODE_COMMANDS,
  builtinCommand,
  commandUnavailableReason,
  routedBuiltinCommands,
  unsupportedCommandReason
} from '@shared/compatibility/vscode/commands/builtin'
import { argToPath } from '@shared/compatibility/vscode/commands/args'

function stubBridge(): HostBridge {
  return new Proxy({}, { get: () => () => undefined }) as unknown as HostBridge
}

function buildApi(env?: Record<string, unknown>): {
  api: Record<string, unknown>
  setTelemetryEnabled: (enabled: boolean) => void
} {
  const bundle = createVscodeApi({
    bridge: stubBridge(),
    extensionId: 'demo.ext',
    extensionPath: '/tmp/demo',
    permissions: [],
    mode: 'strict',
    env: env as never
  })
  return { api: bundle.api, setTelemetryEnabled: bundle.setTelemetryEnabled }
}

function pick<T>(api: Record<string, unknown>, path: string): T {
  return path.split('.').reduce<unknown>((current, key) => {
    return (current as Record<string, unknown>)[key]
  }, api) as T
}

// ── Telemetría ────────────────────────────────────────────────────────────

describe('env.isTelemetryEnabled', () => {
  it('reporta el valor REAL que mandó el main (no un `false` fijo)', () => {
    expect(pick<boolean>(buildApi({ isTelemetryEnabled: true }).api, 'env.isTelemetryEnabled')).toBe(
      true
    )
    expect(pick<boolean>(buildApi({ isTelemetryEnabled: false }).api, 'env.isTelemetryEnabled')).toBe(
      false
    )
  })

  it('sin dato del main queda apagada (default de producto)', () => {
    expect(pick<boolean>(buildApi().api, 'env.isTelemetryEnabled')).toBe(false)
  })

  it('el cambio en caliente actualiza `env` y dispara el evento', () => {
    const { api, setTelemetryEnabled } = buildApi({ isTelemetryEnabled: false })
    const listener = vi.fn()
    const subscribe = pick<(listener: (value: boolean) => void) => { dispose(): void }>(
      api,
      'env.onDidChangeTelemetryEnabled'
    )
    const subscription = subscribe(listener)

    setTelemetryEnabled(true)
    expect(pick<boolean>(api, 'env.isTelemetryEnabled')).toBe(true)
    expect(listener).toHaveBeenCalledWith(true)

    // El mismo valor no vuelve a avisar (evento, no ruido).
    listener.mockClear()
    setTelemetryEnabled(true)
    expect(listener).not.toHaveBeenCalled()

    subscription.dispose()
    setTelemetryEnabled(false)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('env.shell', () => {
  it('expone el shell que resolvió el main', () => {
    expect(pick<string>(buildApi({ shell: '/bin/zsh' }).api, 'env.shell')).toBe('/bin/zsh')
  })

  it('sin dato queda `undefined` (no se inventa un shell)', () => {
    expect(pick<string | undefined>(buildApi().api, 'env.shell')).toBeUndefined()
  })
})

// ── l10n ──────────────────────────────────────────────────────────────────

describe('l10n.t', () => {
  it('sustituye placeholders posicionales', () => {
    expect(substitutePlaceholders('Hola {0}, tenés {1} anclas', ['Juan', 3])).toBe(
      'Hola Juan, tenés 3 anclas'
    )
  })

  it('sustituye placeholders nombrados', () => {
    expect(substitutePlaceholders('{archivo} ({n} líneas)', [{ archivo: 'a.ts', n: 12 }])).toBe(
      'a.ts (12 líneas)'
    )
  })

  it('acepta las dos formas del API (`t(msg, …)` y `t({message, args})`)', () => {
    const t = pick<(...args: unknown[]) => string>(buildApi().api, 'l10n.t')
    expect(t('Hola {0}', 'Ana')).toBe('Hola Ana')
    expect(t({ message: 'Hola {0}', args: ['Ana'] })).toBe('Hola Ana')
  })

  it('no deja `{0}` en pantalla y no rompe con args de menos', () => {
    const t = pick<(...args: unknown[]) => string>(buildApi().api, 'l10n.t')
    expect(t('Sin args')).toBe('Sin args')
    expect(t('A {0} B {1}', 'uno')).toBe('A uno B {1}')
  })
})

// ── Mapa de comandos built-in ─────────────────────────────────────────────

describe('mapa de comandos built-in de VS Code', () => {
  it('no repite ids', () => {
    const ids = BUILTIN_VSCODE_COMMANDS.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('cada comando tiene ruta o un motivo declarado (nunca las dos cosas mudas)', () => {
    for (const entry of BUILTIN_VSCODE_COMMANDS) {
      const hasRoute = Boolean(entry.handler || entry.native)
      expect(hasRoute || Boolean(entry.degradation), `${entry.id} sin ruta ni motivo`).toBe(true)
      if (!hasRoute) expect(entry.degradation?.length ?? 0).toBeGreaterThan(10)
      if (entry.handler && entry.native) {
        throw new Error(`${entry.id} tiene handler y native: la ruta tiene que ser UNA`)
      }
    }
  })

  it('cubre los comandos que una extensión de paneles realmente pide', () => {
    // Medido sobre el bundle instalado de Cline.
    const required = [
      'workbench.action.reloadWindow',
      'workbench.action.openSettings',
      'workbench.action.openWalkthrough',
      'workbench.action.closePanel',
      'workbench.action.terminal.focus',
      'vscode.open',
      'vscode.openFolder'
    ]
    for (const id of required) {
      const entry = builtinCommand(id)
      expect(entry, `${id} no está en la tabla`).toBeDefined()
      expect(Boolean(entry?.handler || entry?.native), `${id} no se puede ejecutar`).toBe(true)
    }
  })

  it('los que no tienen ruta explican el motivo en el error', () => {
    expect(unsupportedCommandReason('vscode.diff')).toContain('diff')
    const message = commandUnavailableReason('vscode.diff')
    expect(message).toContain('vscode.diff')
    expect(message).toContain('no tiene')
    expect(message).not.toContain('undefined')
  })

  it('un id desconocido tiene un error distinto al de uno declarado sin ruta', () => {
    expect(commandUnavailableReason('comando.inventado')).toBe(
      'el IDE no tiene el comando "comando.inventado"'
    )
  })

  it('las delegaciones apuntan a comandos del IDE (ids del registry)', () => {
    const delegated = routedBuiltinCommands().filter((entry) => entry.native)
    expect(delegated.length).toBeGreaterThan(0)
    for (const entry of delegated) expect(entry.native).toMatch(/^[a-z][\w.]*$/)
  })
})

// ── Args de los comandos ──────────────────────────────────────────────────

describe('argToPath', () => {
  it('acepta un path plano', () => {
    expect(argToPath('/home/u/a.ts')).toBe('/home/u/a.ts')
  })

  it('acepta una URI `file://`', () => {
    expect(argToPath('file:///home/u/a%20b.ts')).toBe('/home/u/a b.ts')
  })

  it('acepta el `Uri` serializado del shim (`fsPath`)', () => {
    expect(argToPath({ scheme: 'file', path: '/home/u/a.ts', fsPath: '/home/u/a.ts' })).toBe(
      '/home/u/a.ts'
    )
  })

  it('un esquema virtual NO se abre como archivo de disco', () => {
    expect(argToPath({ scheme: 'scrakk-ext', path: '/x/y.css' })).toBeNull()
  })

  it('objetos y vacíos no producen paths inventados', () => {
    expect(argToPath(undefined)).toBeNull()
    expect(argToPath({})).toBeNull()
    expect(argToPath('   ')).toBeNull()
    expect(argToPath(42)).toBeNull()
  })
})
