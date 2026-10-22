// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Título que la terminal reporta por OSC — `ESC ] 0 ; título` o `ESC ] 2 ; título`
 * (terminadas con BEL `\x07` o ST `ESC \`). Lo setean los prompts (bash/zsh) y
 * las TUIs (vim, lazygit…).
 *
 * El host YA ve los bytes CRUDOS del PTY (`api.terminal.onData`), así que
 * no hace falta que el motor lo reenvíe: se parsea acá.
 *
 * Parser INCREMENTAL: un chunk del PTY corta las secuencias donde quiere, así que
 * el tramo incompleto se guarda hasta el próximo chunk.
 */

/** Extensiones de ejecutable: un "título" que termina en una es una ruta de programa. */
const EXECUTABLE_EXTENSION = /\.(exe|cmd|bat|com)$/i

/**
 * ¿El "título" es en realidad la ruta de un ejecutable?
 *
 * PowerShell manda la ruta de su propio binario al arrancar (con la Store,
 * `C:\Program Files\WindowsApps\Microsoft.PowerShell_7.6.7.0_x64__…\pwsh.exe`).
 * No es un título: es el programa. Sin este filtro la tab de la terminal queda
 * con una ruta larga en lugar de decir "Terminal".
 *
 * Un título de verdad (el cwd de bash, "vim", "lazygit") no es una ruta de
 * ejecutable: los cwd terminan en carpeta, no en `.exe`.
 */
function isExecutablePath(title: string): boolean {
  const value = title.trim()
  if (!value) return false
  if (!value.includes('/') && !value.includes('\\')) return false
  return EXECUTABLE_EXTENSION.test(value)
}

export class OscTitleParser {
  private pending = ''
  private title = ''

  /** Alimenta un chunk. Devuelve el título si CAMBIÓ, o `null` si no. */
  push(chunk: string): string | null {
    this.pending += chunk
    let changed = false

    for (;;) {
      const start = this.pending.indexOf('\x1b]')
      if (start === -1) {
        // Sin OSC acá: sólo se conserva un ESC final (puede abrir una secuencia).
        this.pending = this.pending.endsWith('\x1b') ? '\x1b' : ''
        break
      }

      const bel = this.pending.indexOf('\x07', start + 2)
      const st = this.pending.indexOf('\x1b\\', start + 2)
      let end = -1
      let terminatorLength = 0
      if (bel !== -1 && (st === -1 || bel < st)) {
        end = bel
        terminatorLength = 1
      } else if (st !== -1) {
        end = st
        terminatorLength = 2
      }
      if (end === -1) {
        // OSC incompleta: se conserva desde el `ESC ]` hasta que llegue el resto.
        this.pending = this.pending.slice(start)
        break
      }

      const body = this.pending.slice(start + 2, end)
      this.pending = this.pending.slice(end + terminatorLength)

      // `0` y `2` son "título de la ventana/ícono". El resto de las OSC se ignoran.
      const semi = body.indexOf(';')
      if (semi === 0 || semi === 1) {
        const code = body.slice(0, semi)
        if (code === '0' || code === '2') {
          const value = body.slice(semi + 1)
          // La ruta de un ejecutable no es un título: se ignora y se sigue con
          // el que hubiera (o con el nombre por defecto de la tab).
          if (isExecutablePath(value)) continue
          if (value !== this.title) {
            this.title = value
            changed = true
          }
        }
      }
    }

    // Si nunca llega un terminador, no se acumula infinito.
    if (this.pending.length > 4096) this.pending = this.pending.slice(-64)
    return changed ? this.title : null
  }

  /** Último título visto (vacío si nunca hubo). */
  get value(): string {
    return this.title
  }
}
