export const TERMINAL_IPC = {
  create: 'terminal:create',
  write: 'terminal:write',
  resize: 'terminal:resize',
  destroy: 'terminal:destroy',
  onData: 'terminal:on-data',
  onExit: 'terminal:on-exit',
  getMonoFont: 'terminal:get-mono-font'
} as const

export type TerminalCreateRequest = {
  id: string
  shell?: string
  cwd?: string
  cols?: number
  rows?: number
}

export type TerminalWriteRequest = { id: string; data: string }
export type TerminalResizeRequest = { id: string; cols: number; rows: number }
export type TerminalDestroyRequest = { id: string }

export type TerminalDataPayload = { id: string; data: string }
export type TerminalExitPayload = { id: string; exitCode: number }

export interface TerminalApi {
  create: (req: TerminalCreateRequest) => Promise<{ success: boolean; error?: string }>
  write: (req: TerminalWriteRequest) => Promise<void>
  resize: (req: TerminalResizeRequest) => Promise<void>
  destroy: (req: TerminalDestroyRequest) => Promise<void>
  onData: (callback: (payload: TerminalDataPayload) => void) => () => void
  onExit: (callback: (payload: TerminalExitPayload) => void) => () => void
  /** Detecta la fuente monospace del sistema y devuelve sus bytes. */
  getMonoFont: () => Promise<{ data: number[] } | null>
}
