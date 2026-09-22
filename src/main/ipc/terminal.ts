import { ipcMain, BrowserWindow } from 'electron'
import * as pty from 'node-pty'
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { TERMINAL_IPC, type TerminalCreateRequest, type TerminalWriteRequest, type TerminalResizeRequest, type TerminalDestroyRequest } from '@shared/terminal'

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
  if (shell && shell.startsWith('/')) return shell
  if (shell === 'zsh') return '/bin/zsh'
  if (shell === 'bash' || !shell) return process.env.SHELL || '/bin/bash'
  return shell
}

export function registerTerminalIpc(): void {
  ipcMain.handle(TERMINAL_IPC.create, async (event, req: TerminalCreateRequest) => {
    const { id, shell, cwd, cols, rows } = req
    if (!id) return { success: false, error: 'missing id' }
    if (terms.has(id)) return { success: true }
    const sh = getShell(shell)
    const work = cwd || process.env.HOME || '/'
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
}

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
