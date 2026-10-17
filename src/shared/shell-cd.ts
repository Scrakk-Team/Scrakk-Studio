// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Comando `cd` para reubicar el PTY (puro, testeable por plataforma).
 *
 * En Windows el shell es cmd.exe y **no** existe un escape seguro de comillas
 * dentro de `"…"`: `""` cierra y reabre, y `&` fuera de comillas separa
 * comandos. Por eso una ruta con metacaracteres se rechaza (null) en vez de
 * intentar citarla: una carpeta `x" & calc.exe & rem "` ejecutaba código.
 */

const WIN_UNSAFE = /["&|<>^%\x00\r\n]/
const CONTROL = /[\x00\r\n]/

export function changeDirCommand(dir: string, platform: string = 'linux'): string | null {
  if (!dir || CONTROL.test(dir)) return null
  if (platform === 'win32') {
    if (WIN_UNSAFE.test(dir)) return null
    return `cd /d "${dir}"\r`
  }
  // POSIX: comilla simple (segura con `$`, `;`, `&`…) y `--` para rutas que
  // empiezan con guion. La comilla simple se cierra y se reabre escapada.
  return `cd -- '${dir.replace(/'/g, `'\\''`)}'\r`
}
