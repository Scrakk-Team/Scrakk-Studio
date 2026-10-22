// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

export const TERMINAL_IPC = {
  create: 'terminal:create',
  write: 'terminal:write',
  resize: 'terminal:resize',
  destroy: 'terminal:destroy',
  /** Reubica el shell en un directorio (comando `cd` específico de la shell). */
  cd: 'terminal:cd',
  onData: 'terminal:on-data',
  onExit: 'terminal:on-exit',
  /** Shells detectadas en el sistema (para el selector de Ajustes). */
  listShells: 'terminal:list-shells',
  getMonoFont: 'terminal:get-mono-font',
  /**
   * Cadena de fuentes de la terminal: la primaria y sus reemplazos, EN ORDEN,
   * tal como los resolvería la terminal del sistema.
   */
  getFontStack: 'terminal:get-font-stack',
  /** Familias monoespaciadas instaladas (para elegir la de la terminal). */
  listMonoFonts: 'terminal:list-mono-fonts',
  /** Fuente CJK del sistema, pedida SÓLO cuando el buffer tiene CJK. */
  getCjkFont: 'terminal:get-cjk-font',
  /** Fuente de EMOJI a color del sistema (sólo para code points emoji). */
  getEmojiFont: 'terminal:get-emoji-font',
  /** Fuente y TAMAÑO de la terminal por defecto del sistema. */
  getSystemFont: 'terminal:get-system-font'
} as const

export type TerminalCreateRequest = {
  id: string
  shell?: string
  cwd?: string
  cols?: number
  rows?: number
}

export type TerminalWriteRequest = { id: string; data: string }
export type TerminalCdRequest = { id: string; path: string }
export type TerminalResizeRequest = { id: string; cols: number; rows: number }
export type TerminalDestroyRequest = { id: string }

export type TerminalDataPayload = { id: string; data: string }
export type TerminalExitPayload = { id: string; exitCode: number }

/**
 * Familia de una shell: define CÓMO se reubica (el comando `cd`) y cómo se
 * etiqueta en Ajustes.
 *
 * - `cmd`: `cmd.exe` — `cd /d "…"`
 * - `powershell`: `powershell.exe` / `pwsh.exe` — `Set-Location -LiteralPath '…'`
 * - `posix`: bash/zsh/fish — `cd -- '…'`
 * - `other`: una shell de la que NO se conoce la sintaxis (WSL, fish exotic…):
 *   no se le manda ningún `cd`, antes que mandarle uno equivocado.
 */
export type ShellFamily = 'cmd' | 'powershell' | 'posix' | 'other'

/** De dónde salió la shell que se usa (para el diagnóstico y los tests). */
export type ShellSource = 'setting' | 'windows-terminal' | 'fallback' | 'posix'

/** Una shell que se puede lanzar en una PTY. */
export interface TerminalShellCandidate {
  /** Identificador estable: la ruta del ejecutable. */
  id: string
  /** Nombre legible ("PowerShell 7", "Command Prompt"…). */
  label: string
  /** Ruta o comando del ejecutable. */
  path: string
  /** Argumentos con los que se lanza. */
  args: string[]
  /** Familia: define el `cd` y cómo se reubica. */
  family: ShellFamily
}

/** Lo que necesita el selector de Ajustes para armar sus opciones. */
export interface TerminalShellInfo {
  /** La shell que se usaría con la configuración actual (la elegida o la detectada). */
  detected: TerminalShellCandidate
  /** Todas las candidatas del sistema, la detectada primero. */
  candidates: TerminalShellCandidate[]
}

/** Una fuente de la cadena de la terminal, con sus bytes ya leídos. */
export type TerminalFontFile = {
  /** Familia de la fuente (sólo diagnóstico; el motor usa los bytes). */
  family: string
  /** Ruta del archivo en el sistema (diagnóstico). */
  file: string
  /** Bytes del archivo, para escribirlo en el FS virtual del motor. */
  data: Uint8Array
}

export interface TerminalApi {
  create: (req: TerminalCreateRequest) => Promise<{ success: boolean; error?: string }>
  write: (req: TerminalWriteRequest) => Promise<void>
  /** Reubica el shell en `path` con el `cd` que corresponda a la shell. */
  cd: (req: TerminalCdRequest) => Promise<void>
  resize: (req: TerminalResizeRequest) => Promise<void>
  destroy: (req: TerminalDestroyRequest) => Promise<void>
  onData: (callback: (payload: TerminalDataPayload) => void) => () => void
  onExit: (callback: (payload: TerminalExitPayload) => void) => () => void
  /** Detecta la fuente monospace del sistema y devuelve sus bytes. */
  getMonoFont: () => Promise<{ data: number[] } | null>
  /**
   * Cadena de fuentes de la terminal: `[0]` es la primaria y el resto son los
   * reemplazos, EN ORDEN — la misma cadena que resolvería la terminal del
   * sistema (fontconfig en Linux).
   *
   * `family` es la familia elegida en Ajustes: si viene, ESA es la primaria y
   * los reemplazos se resuelven como si el usuario tuviera esa fuente. Sin ella
   * se usa la monoespaciada por defecto del sistema.
   *
   * Se resuelve EN CALIENTE en cada llamada: no se guarda en disco ni se
   * empaqueta, así lo que se ve es siempre la fuente del sistema del usuario.
   * `null` si no se pudo resolver ninguna.
   */
  getFontStack: (req?: { family?: string }) => Promise<TerminalFontFile[] | null>
  /** Familias monoespaciadas instaladas (para el selector de Ajustes). */
  listMonoFonts: () => Promise<string[]>
  /**
   * Fuente CJK del sistema (japonés / chino / coreano), pedida **bajo demanda**:
   * pesa decenas de MB y cada terminal carga su copia, así que no entra en la
   * cadena por defecto — sólo cuando en el buffer aparece un carácter CJK.
   * `null` si no hay ninguna (o es más grande que el tope).
   */
  getCjkFont: (req?: { family?: string }) => Promise<TerminalFontFile | null>
  /**
   * Fuente de EMOJI a COLOR del sistema (Noto Color Emoji / Segoe UI Emoji).
   *
   * Va aparte de la cadena porque la decisión es por code point: sólo los de
   * presentación emoji se dibujan con ésta; los símbolos de presentación texto
   * (`✓ ❤ ☀ ⚠`) siguen monocromos, como los ve el CLI en su terminal.
   */
  getEmojiFont: () => Promise<TerminalFontFile | null>
  /**
   * Fuente y TAMAÑO de la terminal por defecto del sistema.
   *
   * No alcanza con la misma familia: si el tamaño no coincide, el ancho y el
   * alto de celda tampoco, y los TUIs (que mezclan `─` con `│`) no cuadran.
   * `null` si no se pudo resolver.
   */
  getSystemFont: () => Promise<{ family: string; px: number } | null>
  /**
   * Shells que hay en el sistema y cuál se detectaría por defecto.
   *
   * En Windows la detección mira la terminal por defecto del usuario (Windows
   * Terminal → su perfil por defecto) y, si no hay, `pwsh`/`powershell`/`cmd`.
   */
  listShells: () => Promise<TerminalShellInfo>
}
