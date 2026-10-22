// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Comando `cd` para reubicar el PTY (puro, testeable por plataforma).
 *
 * Cada shell tiene SU sintaxis, así que el comando depende de la shell con la
 * que se abrió la PTY:
 *
 * - **cmd.exe**: `cd /d "…"`. El `/d` salta de unidad. No existe un escape
 *   seguro de comillas dentro de `"…"`: `""` cierra y reabre, y `&` fuera de
 *   comillas separa comandos. Por eso una ruta con metacaracteres se rechaza
 *   (null) en vez de intentar citarla: una carpeta `x" & calc.exe & rem "`
 *   ejecutaba código.
 * - **PowerShell**: `Set-Location -LiteralPath '…'`. `cd` es un alias, pero
 *   `cd /d "…"` NO existe: `/d` se toma como argumento posicional y el comando
 *   falla con *"A positional parameter cannot be found that accepts argument"*.
 *   Con comilla simple no hay expansión (ni de `$`, ni de `%`, ni de `&`), así
 *   que sólo hay que escapar la comilla duplicándola. `-LiteralPath` evita que
 *   los corchetes de una ruta se lean como comodines.
 * - **POSIX**: comilla simple (segura con `$`, `;`, `&`…) y `--` para rutas que
 *   empiezan con guion. La comilla simple se cierra y se reabre escapada.
 *
 * En Windows, una shell POSIX (Git Bash, MSYS2) recibe la ruta en su forma
 * `/c/…`: `C:\Users\dev` no es una ruta válida para bash.
 */

import type { ShellFamily } from './terminal'

const WIN_UNSAFE = /["&|<>^%\x00\r\n]/
const CONTROL = /[\x00\r\n]/

/**
 * @param dir      Ruta destino.
 * @param platform `win32` o POSIX (por defecto, POSIX).
 * @param family   Familia de la shell. Si no se pasa, se deduce de la
 *                 plataforma: `cmd` en Windows, `posix` en el resto.
 */
export function changeDirCommand(dir: string, platform: string = 'linux', family?: ShellFamily): string | null {
  if (!dir || CONTROL.test(dir)) return null
  const kind: ShellFamily = family ?? (platform === 'win32' ? 'cmd' : 'posix')
  if (kind === 'cmd') return cmdChangeDir(dir)
  if (kind === 'powershell') return powershellChangeDir(dir)
  if (kind === 'posix') return posixChangeDir(dir, platform)
  // Una shell de la que no se conoce la sintaxis (WSL, fish…) no recibe nada:
  // antes que mandarle un `cd` equivocado.
  return null
}

/** cmd.exe: `cd /d "…"`, con las comillas dobles del propio cmd. */
function cmdChangeDir(dir: string): string | null {
  if (WIN_UNSAFE.test(dir)) return null
  return `cd /d "${dir}"\r`
}

/** PowerShell: `Set-Location -LiteralPath '…'`, con comilla simple escapada. */
function powershellChangeDir(dir: string): string | null {
  // La comilla simple es literal en PowerShell: no hay que rechazar nada más.
  return `Set-Location -LiteralPath '${dir.replace(/'/g, "''")}'\r`
}

/** POSIX: `cd -- '…'`. */
function posixChangeDir(dir: string, platform: string): string | null {
  const target = platform === 'win32' ? toMsysPath(dir) : dir
  return `cd -- '${target.replace(/'/g, `'\\''`)}'\r`
}

/**
 * Ruta de Windows → ruta POSIX de MSYS2/Git Bash.
 *
 * `C:\Users\dev` → `/c/Users/dev`. Es la forma que mountea el runtime de MSYS
 * (el de Git Bash): la unidad como `/c`. Sin esto, bash no encuentra la ruta.
 */
export function toMsysPath(dir: string): string {
  const normalized = dir.replace(/\\/g, '/')
  const match = /^([A-Za-z]):\/(.*)$/.exec(normalized)
  if (!match) return normalized
  return `/${match[1].toLowerCase()}/${match[2]}`
}
