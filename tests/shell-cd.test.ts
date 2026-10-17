// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * `cd` del terminal y nombre del PNG: dos rutas que el renderer controla y que
 * antes se concatenaban a un comando / a una ruta sin sanear.
 */

import { describe, it, expect } from 'vitest'
import { changeDirCommand } from '../src/shared/shell-cd'
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
