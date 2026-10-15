// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { ipcMain, BrowserWindow, screen } from 'electron'
import * as pty from 'node-pty'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execSync } from 'child_process'
import { TERMINAL_IPC, type TerminalCreateRequest, type TerminalCdRequest, type TerminalWriteRequest, type TerminalResizeRequest, type TerminalDestroyRequest } from '@shared/terminal'
import {
  listMonoFamilies,
  readFontStack,
  resolveCjkFont,
  resolveEmojiFont,
  resolveFontCandidates,
  resolveSystemTerminalFont
} from '../fonts/systemFonts'

import { t } from '@shared/i18n'
interface PtyProc {
  write: (d: string) => void
  resize: (cols: number, rows: number) => void
  kill: (sig?: string) => void
  onData: (cb: (data: string) => void) => void
  onExit: (cb: (code: number) => void) => void
}

const terms = new Map<string, PtyProc>()

/** Entero positivo o el fallback (node-pty rechaza 0/NaN al crear o resized). */
function positiveInt(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function getShell(shell?: string): string {
  // Windows no tiene `/bin/*`. El renderer manda el nombre POSIX ('bash') por
  // compatibilidad con Linux: acá se ignora y se usa el shell del sistema
  // (ComSpec → cmd.exe). Una ruta explícita (con separador) se respeta tal cual.
  if (process.platform === 'win32') {
    if (shell && /[/\\]/.test(shell)) return shell
    return process.env.ComSpec || process.env.COMSPEC || 'cmd.exe'
  }
  if (shell && shell.startsWith('/')) return shell
  if (shell === 'zsh') return '/bin/zsh'
  if (shell === 'bash' || !shell) return process.env.SHELL || '/bin/bash'
  return shell
}

/**
 * Comando `cd` para reubicar el shell, según la plataforma.
 *
 * En Windows el shell es cmd.exe (`/d` cambia de unidad si hace falta); en
 * POSIX se usa comilla simple (segura con espacios y `$`) y `--` para rutas
 * que empiezan con guion.
 */
function changeDirCommand(dir: string): string {
  if (process.platform === 'win32') {
    return `cd /d "${dir.replace(/"/g, '""')}"\r`
  }
  return `cd -- '${dir.replace(/'/g, `'\\''`)}'\r`
}

export function registerTerminalIpc(): void {
  ipcMain.handle(TERMINAL_IPC.create, async (event, req: TerminalCreateRequest) => {
    const { id, shell, cwd, cols, rows } = req
    if (!id) return { success: false, error: t('main.missing.id') }
    if (terms.has(id)) return { success: true }
    const sh = getShell(shell)
    const work = cwd || os.homedir()
    // La vista puede medir 0×0 (canvas sin layout todavía): node-pty exige
    // positivos, así que se cae a 80×24.
    const initialCols = positiveInt(cols, 80)
    const initialRows = positiveInt(rows, 24)
    // PTY real con node-pty: convierte \n -> \r\n automáticamente, señales, resize.
    const { npm_config_prefix: _omit, ...cleanEnv } = process.env as Record<string, string | undefined>
    const proc = pty.spawn(sh, [], {
      name: 'xterm-256color',
      cwd: work,
      env: {
        ...cleanEnv,
        TERM: 'xterm-256color',
        COLUMNS: String(initialCols),
        LINES: String(initialRows)
      } as Record<string, string>,
      cols: initialCols,
      rows: initialRows
    }) as unknown as PtyProc

    terms.set(id, proc)
    const win = BrowserWindow.fromWebContents(event.sender)
    const sendData = (data: string): void => {
      win?.webContents.send(TERMINAL_IPC.onData, { id, data })
    }
    const sendExit = (code: number): void => {
      win?.webContents.send(TERMINAL_IPC.onExit, { id, exitCode: code })
    }

    proc.onData((data) => sendData(data))
    proc.onExit((code) => {
      sendExit(code)
      terms.delete(id)
    })
    return { success: true }
  })

  ipcMain.handle(TERMINAL_IPC.write, async (_event, req: TerminalWriteRequest) => {
    const proc = terms.get(req.id)
    if (proc) proc.write(req.data)
  })

  ipcMain.handle(TERMINAL_IPC.cd, async (_event, req: TerminalCdRequest) => {
    const proc = terms.get(req.id)
    if (proc && req.path) proc.write(changeDirCommand(req.path))
  })

  ipcMain.handle(TERMINAL_IPC.resize, async (_event, req: TerminalResizeRequest) => {
    const proc = terms.get(req.id)
    if (!proc) return
    // La vista emite resize antes de tener tamaño: node-pty tira
    // "resizing must be done using positive cols and rows". Se ignora.
    const cols = positiveInt(req.cols, 0)
    const rows = positiveInt(req.rows, 0)
    if (cols > 0 && rows > 0) proc.resize(cols, rows)
  })

  ipcMain.handle(TERMINAL_IPC.destroy, async (_event, req: TerminalDestroyRequest) => {
    const proc = terms.get(req.id)
    if (proc) {
      proc.kill()
      terms.delete(req.id)
    }
  })

  // Detect the system's default monospace font and return its bytes.
  // The renderer writes them to the WASM virtual FS so FreeType can load it.
  ipcMain.handle(TERMINAL_IPC.getMonoFont, async () => {
    try {
      const fontPath = detectSystemMonoFont()
      if (!fontPath) return null
      const data = fs.readFileSync(fontPath)
      return { data: Array.from(data) }
    } catch {
      return null
    }
  })

  // Cadena COMPLETA de la terminal (primaria + reemplazos), resuelta EN CALIENTE
  // desde el sistema. Ver `resolveFontCandidates`.
  //
  // `family` es la elegida en Ajustes; sin ella se usa la mono del sistema.
  ipcMain.handle(TERMINAL_IPC.getFontStack, async (_event, req?: { family?: string }) => {
    try {
      return readFontStack(resolveFontCandidates(req?.family))
    } catch {
      return null
    }
  })

  // Familias monoespaciadas instaladas, para el selector de Ajustes.
  ipcMain.handle(TERMINAL_IPC.listMonoFonts, async () => {
    try {
      return listMonoFamilies()
    } catch {
      return []
    }
  })

  // Fuente CJK, SÓLO bajo demanda (cuando el buffer tiene CJK): es grande.
  ipcMain.handle(TERMINAL_IPC.getCjkFont, async (_event, req?: { family?: string }) => {
    try {
      return resolveCjkFont(req?.family)
    } catch {
      return null
    }
  })

  // Fuente de EMOJI a color del sistema. No va en la cadena: se usa sólo para
  // los code points con presentación emoji (ver `FontAtlas::EnsureGlyph`).
  ipcMain.handle(TERMINAL_IPC.getEmojiFont, async () => {
    try {
      return resolveEmojiFont()
    } catch {
      return null
    }
  })

  // Fuente Y TAMAÑO de la terminal del sistema: sin el tamaño correcto, las
  // métricas de celda no coinciden y los TUIs no cuadran.
  ipcMain.handle(TERMINAL_IPC.getSystemFont, async (event) => {
    try {
      // El `FontSize` de conhost viene en px de DISPOSITIVO: se le pasa el scale
      // del monitor para normalizarlo a px lógicos (ver `windowsConsoleEmPx`).
      let scaleFactor = 1
      try {
        const win = BrowserWindow.fromWebContents(event.sender)
        const bounds = win?.getBounds() ?? screen.getPrimaryDisplay().bounds
        scaleFactor = screen.getDisplayMatching(bounds).scaleFactor || 1
      } catch {
        // Sin ventana/display: 1.
      }
      return resolveSystemTerminalFont(scaleFactor)
    } catch {
      return null
    }
  })
}

// La resolución de la cadena vive en `../fonts/systemFonts` (sin Electron, para
// poder testearla): acá sólo se la llama.

/**
 * Detect the system's default monospace font.
 * Linux: fc-match (fontconfig), Windows: Consolas, macOS: Menlo.
 */
function detectSystemMonoFont(): string | null {
  const platform = process.platform

  if (platform === 'linux') {
    try {
      const result = execSync('fc-match --format=%{file} monospace', {
        encoding: 'utf-8',
        timeout: 3000
      }).trim()
      if (result && fs.existsSync(result)) return result
    } catch {}
    // Fallback: common Linux monospace fonts
    const candidates = [
      '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf',
      '/usr/share/fonts/truetype/ubuntu/UbuntuMono-R.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf',
    ]
    return candidates.find(p => fs.existsSync(p)) ?? null
  }

  if (platform === 'win32') {
    const winFonts = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts')
    const candidates = [
      path.join(winFonts, 'consola.ttf'),
      path.join(winFonts, 'lucon.ttf'),
      path.join(winFonts, 'cour.ttf'),
    ]
    return candidates.find(p => fs.existsSync(p)) ?? null
  }

  if (platform === 'darwin') {
    const candidates = [
      '/System/Library/Fonts/Menlo.ttc',
      '/System/Library/Fonts/Courier.dfont',
      '/Library/Fonts/Menlo.ttc',
    ]
    return candidates.find(p => fs.existsSync(p)) ?? null
  }

  return null
}
