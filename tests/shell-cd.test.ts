// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * `cd` del terminal y nombre del PNG: dos rutas que el renderer controla y que
 * antes se concatenaban a un comando / a una ruta sin sanear.
 *
 * El `cd` depende de la SHELL: cada una tiene su sintaxis, y la de cmd.exe
 * (`cd /d "…"`) no existe en PowerShell.
 */

import { describe, it, expect } from 'vitest'
import { changeDirCommand, toMsysPath } from '../src/shared/shell-cd'
import { sanitizeScreenshotName } from '../src/shared/screenshot'

describe('changeDirCommand — POSIX', () => {
  it('cita rutas normales', () => {
    expect(changeDirCommand('/home/dev/mi app', 'linux')).toBe("cd -- '/home/dev/mi app'\r")
  })

  it('escapa comillas simples', () => {
    expect(changeDirCommand("/tmp/it's", 'linux')).toBe("cd -- '/tmp/it'\\''s'\r")
  })

  it('rechaza CR/LF', () => {
    expect(changeDirCommand('/tmp/x\nrm -rf ~', 'linux')).toBeNull()
    expect(changeDirCommand('/tmp/x\rrm', 'linux')).toBeNull()
  })
})

describe('changeDirCommand — Windows (cmd.exe)', () => {
  it('usa /d y comillas en rutas normales', () => {
    expect(changeDirCommand('C:\\Users\\dev\\proj', 'win32')).toBe('cd /d "C:\\Users\\dev\\proj"\r')
  })

  it('rechaza metacaracteres en vez de intentar escaparlos', () => {
    expect(changeDirCommand('C:\\x" & calc.exe & rem "', 'win32')).toBeNull()
    expect(changeDirCommand('C:\\x&calc', 'win32')).toBeNull()
    expect(changeDirCommand('C:\\x|calc', 'win32')).toBeNull()
    expect(changeDirCommand('C:\\x^calc', 'win32')).toBeNull()
    expect(changeDirCommand('C:\\x%PATH%', 'win32')).toBeNull()
  })
})

describe('changeDirCommand — PowerShell', () => {
  it('usa Set-Location, no "cd /d"', () => {
    expect(changeDirCommand('C:\\Users\\dev\\proj', 'win32', 'powershell')).toBe(
      "Set-Location -LiteralPath 'C:\\Users\\dev\\proj'\r"
    )
  })

  it('acepta rutas con metacaracteres: la comilla simple es literal', () => {
    expect(changeDirCommand('C:\\R&D\\proj', 'win32', 'powershell')).toBe(
      "Set-Location -LiteralPath 'C:\\R&D\\proj'\r"
    )
    expect(changeDirCommand('C:\\a b\\proj', 'win32', 'powershell')).toBe(
      "Set-Location -LiteralPath 'C:\\a b\\proj'\r"
    )
  })

  it('duplica la comilla simple para escaparla', () => {
    expect(changeDirCommand("C:\\it's\\proj", 'win32', 'powershell')).toBe(
      "Set-Location -LiteralPath 'C:\\it''s\\proj'\r"
    )
  })

  it('rechaza CR/LF', () => {
    expect(changeDirCommand('C:\\x\nrm -rf ~', 'win32', 'powershell')).toBeNull()
  })
})

describe('changeDirCommand — shell POSIX en Windows (Git Bash)', () => {
  it('traduce la ruta a la forma de MSYS', () => {
    expect(changeDirCommand('C:\\Users\\dev\\proj', 'win32', 'posix')).toBe(
      "cd -- '/c/Users/dev/proj'\r"
    )
  })
})

describe('changeDirCommand — shell desconocida', () => {
  it('no manda ningún cd antes que mandar uno equivocado', () => {
    expect(changeDirCommand('C:\\Users\\dev\\proj', 'win32', 'other')).toBeNull()
  })
})

describe('toMsysPath', () => {
  it('baja la letra de la unidad', () => {
    expect(toMsysPath('C:\\Users\\dev')).toBe('/c/Users/dev')
    expect(toMsysPath('D:\\data')).toBe('/d/data')
  })

  it('deja las rutas que no son de unidad como están', () => {
    expect(toMsysPath('/home/dev')).toBe('/home/dev')
  })
})

describe('sanitizeScreenshotName', () => {
  it('se queda con el basename y quita separadores', () => {
    expect(sanitizeScreenshotName('../../.config/autostart/x', 'fallback')).toBe('x')
    expect(sanitizeScreenshotName('C:\\Windows\\evil', 'fallback')).toBe('evil')
    expect(sanitizeScreenshotName('/tmp/shot.png', 'fallback')).toBe('shot')
  })

  it('normaliza caracteres raros', () => {
    expect(sanitizeScreenshotName('captura 2026', 'fallback')).toBe('captura_2026')
  })

  it('cae al nombre por defecto si queda vacío', () => {
    expect(sanitizeScreenshotName('../../', 'innerta-1')).toBe('innerta-1')
    expect(sanitizeScreenshotName('', 'innerta-1')).toBe('innerta-1')
    expect(sanitizeScreenshotName(undefined, 'innerta-1')).toBe('innerta-1')
  })
})
