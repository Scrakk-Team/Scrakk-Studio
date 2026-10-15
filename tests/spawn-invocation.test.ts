// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Lanzar comandos: en Windows los shims `.cmd`/`.bat` (npm, gem, …) NO se pueden
 * spawnear sin `shell: true` — desde Node 18.20/20.12 tira `EINVAL` (el fix de
 * seguridad de Windows). Esto era el `spawn EINVAL` al instalar servidores LSP.
 */

import { describe, it, expect } from 'vitest'
import { spawnInvocation } from '../src/main/binaries'

describe('spawnInvocation', () => {
  it('lanzamiento normal: sin shell, args intactos', () => {
    expect(spawnInvocation('npm', ['install', 'x'], 'linux')).toEqual({
      file: 'npm',
      args: ['install', 'x'],
      shell: false
    })
    // Un .exe de Windows tampoco necesita shell.
    expect(spawnInvocation('C:\\tools\\tar.exe', ['-xf', 'a.zip'], 'win32')).toEqual({
      file: 'C:\\tools\\tar.exe',
      args: ['-xf', 'a.zip'],
      shell: false
    })
  })

  it('shim .cmd en Windows: pasa por shell y cita los args con espacios', () => {
    const out = spawnInvocation(
      'C:\\Users\\x\\AppData\\Roaming\\npm\\npm.cmd',
      ['install', '--prefix', 'C:\\Users\\x\\AppData\\Roaming\\Scrakk Studio\\lsp\\npm', 'pyright'],
      'win32'
    )
    expect(out.shell).toBe(true)
    expect(out.args).toEqual([])
    expect(out.file).toBe(
      'C:\\Users\\x\\AppData\\Roaming\\npm\\npm.cmd install --prefix ' +
        '"C:\\Users\\x\\AppData\\Roaming\\Scrakk Studio\\lsp\\npm" pyright'
    )
  })

  it('un .cmd en Linux NO se manda al shell (no aplica)', () => {
    expect(spawnInvocation('/usr/bin/npm.cmd', ['x'], 'linux').shell).toBe(false)
  })
})
