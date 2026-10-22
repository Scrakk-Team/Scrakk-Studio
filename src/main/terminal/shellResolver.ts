// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * La shell que corre dentro de la terminal integrada.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ
 *
 * En Windows la terminal arrancaba SIEMPRE `cmd.exe`, porque el main devolvía
 * `ComSpec` (`C:\Windows\System32\cmd.exe`) sin mirar nada más. `ComSpec` es
 * el "command processor" legacy de Windows — no es el shell del usuario: un
 * developer con PowerShell 7 (o con Windows Terminal como terminal por
 * defecto) seguía cayendo en cmd.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CÓMO SE RESUELVE (Windows)
 *
 * 1. **Ajuste explícito** del usuario (Ajustes → Terminal): gana todo.
 * 2. **Windows Terminal**: si la terminal por defecto del usuario es Windows
 *    Terminal, su perfil por defecto es el shell que el usuario quiere ver.
 *    Se lee `HKCU\Console\%%Startup\DelegationConsole` y, si delega en
 *    Windows Terminal, su `settings.json` (`defaultProfile` → perfil →
 *    `commandline`).
 * 3. **Fallback**: `pwsh.exe` → `powershell.exe` → `cmd.exe` (el primero que
 *    exista en el PATH).
 *
 * En POSIX no cambia nada: `SHELL` del entorno, o `/bin/bash`.
 *
 * Este archivo NO importa Electron a propósito: así se puede testear (ver
 * `tests/terminal-shell.test.ts`) sin levantar la ventana.
 */

import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'
import type {
  ShellFamily,
  ShellSource,
  TerminalShellCandidate,
  TerminalShellInfo
} from '@shared/terminal'

/**
 * CLSID de Windows Terminal como terminal por defecto (la pareja
 * `DelegationConsole`/`DelegationTerminal` de `HKCU\Console\%%Startup`).
 *
 * Con estos GUIDs, `conhost.exe` delega la ventana en Windows Terminal. No es
 * el shell — es la APP que hospeda la consola — pero es la que guarda el perfil
 * por defecto que el usuario eligió.
 */
export const WINDOWS_TERMINAL_GUID = '{2EACA947-7F5F-4CFA-BA87-8F7FBEEFBE69}'

/** Windows Console Host (conhost) legacy. */
export const CONHOST_GUID = '{B23D10C0-E52E-411E-9D5B-C09FDF709C7D}'

/** "Selección automática": Windows decide (Windows Terminal si está instalado). */
export const AUTOMATIC_GUID = '{00000000-0000-0000-0000-000000000000}'

/** Clave de registro con la terminal por defecto del usuario. */
const STARTUP_KEY = 'HKCU\\Console\\%%Startup'

/** Perfiles dinámicos de Windows Terminal → ejecutable que lanzan. */
const WT_DYNAMIC_PROFILES: Record<string, string> = {
  'Windows.Terminal.PowershellCore': 'pwsh.exe',
  'Windows.Terminal.WindowsPowerShell': 'powershell.exe',
  'Windows.Terminal.System': 'cmd.exe',
  'Windows.Terminal.WSL': 'wsl.exe'
}

/**
 * Accesos al sistema que usa el resolver.
 *
 * Se inyectan para poder testear el resolver completo (registro, archivo de
 * Windows Terminal, PATH) sin tocar la máquina del que corre los tests.
 */
export interface ShellProbe {
  platform: NodeJS.Platform
  env: Record<string, string | undefined>
  /** Valor de una clave de registro (sólo Windows). `undefined` si no está. */
  registry: (key: string, value: string) => string | undefined
  /** Texto de un archivo. `undefined` si no existe o no se puede leer. */
  readText: (file: string) => string | undefined
  /** Si una ruta existe en el disco. */
  exists: (file: string) => boolean
  /** Ruta absoluta de un ejecutable en el PATH. `undefined` si no está. */
  which: (name: string) => string | undefined
}

/** La shell resuelta: qué se lanza y cómo se reubica. */
export interface ResolvedShell extends TerminalShellCandidate {
  /** De dónde salió la decisión. */
  source: ShellSource
}

/* ───────────────────────────────────────────────────────────────────────────
 * Accesos al sistema real
 * ─────────────────────────────────────────────────────────────────────────── */

/** Cache del registro: `reg.exe` es un proceso y esto se consulta varias veces. */
const registryCache = new Map<string, string | undefined>()

/**
 * Lee un valor `REG_SZ` del registro con `reg.exe`.
 *
 * Node no tiene API de registro y no se quiere agregar una dependencia nativa
 * (el lockfile es parte del CI), así que va `reg.exe`: está en todas las
 * instalaciones de Windows y `reg query` devuelve la clave y el valor en texto.
 */
function readRegistryValue(key: string, value: string): string | undefined {
  const cacheKey = `${key}\\${value}`
  const cached = registryCache.get(cacheKey)
  if (cached !== undefined) return cached

  let result: string | undefined
  try {
    const out = execFileSync('reg', ['query', key, '/v', value], {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    // Formato: "    DelegationConsole    REG_SZ    {2EACA947-…}"
    const match = new RegExp(`${escapeRegExp(value)}\\s+REG_\\w+\\s+(.*)$`, 'm').exec(out)
    result = match ? match[1].trim() : undefined
  } catch {
    // La clave no existe (o `reg` no está): no hay terminal por defecto.
    result = undefined
  }
  registryCache.set(cacheKey, result)
  return result
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * ¿Existe el archivo?
 *
 * `fs.existsSync` devuelve `false` cuando el archivo existe pero NO se puede
 * leer, y eso es justo el caso de los **alias de ejecución de WindowsApps**
 * (`…\Microsoft\WindowsApps\pwsh.exe`): `stat` tira `EACCES`, pero el archivo
 * está y se puede ejecutar — es la forma en que se instala PowerShell 7 desde
 * la Store, que no deja nada en `Program Files`.
 *
 * Con `existsSync` esos ejecutables no se veían nunca y la terminal caía en
 * `cmd.exe` siendo el usuario de PowerShell 7.
 */
function fileExists(file: string): boolean {
  try {
    fs.statSync(file)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    // EACCES/EPERM: está, pero no se puede leer → cuenta como existente.
    return code === 'EACCES' || code === 'EPERM'
  }
}

/** Busca un ejecutable en el PATH (con `PATHEXT` en Windows). */
function whichSync(name: string, env: Record<string, string | undefined>, platform: NodeJS.Platform): string | undefined {
  if (!name) return undefined
  if (name.includes('/') || (platform === 'win32' && name.includes('\\'))) {
    return fileExists(name) ? name : undefined
  }
  const dirs = (env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean)
  const extensions =
    platform === 'win32'
      ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
      : ['']
  for (const dir of dirs) {
    // Primero el nombre tal cual (por si ya trae extensión).
    const direct = path.join(dir, name)
    if (fileExists(direct)) return direct
    for (const extension of extensions) {
      const candidate = path.join(dir, name + extension)
      if (fileExists(candidate)) return candidate
    }
  }
  return undefined
}

/** El probe real (el sistema donde corre la app). */
export function systemShellProbe(): ShellProbe {
  return {
    platform: process.platform,
    env: process.env,
    registry: readRegistryValue,
    readText: (file) => {
      try {
        return fs.readFileSync(file, 'utf-8')
      } catch {
        return undefined
      }
    },
    exists: (file) => fileExists(file),
    which: (name) => whichSync(name, process.env, process.platform)
  }
}

/* ───────────────────────────────────────────────────────────────────────────
 * Resolución
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Resuelve la shell con la que se abre la terminal.
 *
 * @param probe  Accesos al sistema (inyectados para testear).
 * @param setting Elección del usuario ('' o `undefined` = automática).
 */
export function resolveShell(probe: ShellProbe, setting?: string): ResolvedShell {
  if (probe.platform === 'win32') return resolveWindowsShell(probe, setting)
  return resolvePosixShell(probe)
}

/** POSIX: la `SHELL` del entorno (o `/bin/bash`). */
function resolvePosixShell(probe: ShellProbe): ResolvedShell {
  const shell = probe.env.SHELL && probe.env.SHELL.trim() ? probe.env.SHELL.trim() : '/bin/bash'
  return {
    id: shell,
    label: path.basename(shell),
    path: shell,
    args: [],
    family: shellFamilyFor(shell),
    source: 'posix'
  }
}

function resolveWindowsShell(probe: ShellProbe, setting?: string): ResolvedShell {
  const chosen = setting?.trim()
  if (chosen) {
    const explicit = resolveExplicitShell(probe, chosen)
    if (explicit) return { ...explicit, source: 'setting' }
  }

  const terminal = detectWindowsTerminalShell(probe)
  if (terminal) return { ...terminal, source: 'windows-terminal' }

  const fallback = detectFallbackShell(probe)
  return { ...fallback, source: 'fallback' }
}

/**
 * La shell que el usuario eligió a mano (Ajustes → Terminal).
 *
 * Acepta un nombre (`pwsh`), un nombre con extensión (`pwsh.exe`), una ruta
 * absoluta o un comando con argumentos (`pwsh.exe -NoLogo`).
 */
function resolveExplicitShell(probe: ShellProbe, choice: string): TerminalShellCandidate | null {
  const { path: command, args } = parseCommandLine(choice)
  if (!command) return null
  const expanded = expandWindowsEnv(command, probe.env)
  const resolved = isWindowsPath(expanded)
    ? probe.exists(expanded)
      ? expanded
      : null
    : probe.which(expanded) ?? probe.which(`${expanded}.exe`) ?? null
  if (!resolved) return null
  return {
    id: resolved,
    label: friendlyLabel(resolved),
    path: resolved,
    args,
    family: shellFamilyFor(resolved)
  }
}

/**
 * La shell del perfil por defecto de Windows Terminal.
 *
 * Sólo se usa si Windows Terminal es la terminal por defecto del usuario: si
 * dejó el valor en "automático", Windows Terminal manda si está instalado, así
 * que se busca su `settings.json` igual.
 */
export function detectWindowsTerminalShell(probe: ShellProbe): TerminalShellCandidate | null {
  const delegation = (probe.registry(STARTUP_KEY, 'DelegationConsole') ?? '').trim().toUpperCase()
  if (delegation === CONHOST_GUID) return null
  if (delegation && delegation !== AUTOMATIC_GUID && delegation !== WINDOWS_TERMINAL_GUID) {
    // Una terminal por defecto que no se conoce: no se puede leer su perfil.
    return null
  }

  const settings = readWindowsTerminalSettings(probe)
  if (!settings) return null
  return shellFromWindowsTerminalProfile(probe, settings)
}

/** Rutas donde Windows Terminal guarda su `settings.json`. */
export function windowsTerminalSettingsPaths(env: Record<string, string | undefined>): string[] {
  const local = env.LOCALAPPDATA
  if (!local) return []
  return [
    `${local}\\Packages\\Microsoft.WindowsTerminal_8wekyb3d8bbwe\\LocalState\\settings.json`,
    `${local}\\Microsoft\\Windows Terminal\\settings.json`
  ]
}

/** Lee (y parsea) el `settings.json` de Windows Terminal. */
function readWindowsTerminalSettings(probe: ShellProbe): WindowsTerminalSettings | null {
  for (const file of windowsTerminalSettingsPaths(probe.env)) {
    const text = probe.readText(file)
    if (!text) continue
    try {
      const parsed = parseJsonc(text)
      if (parsed && typeof parsed === 'object') return parsed as WindowsTerminalSettings
    } catch {
      // JSON inválido (a mano): se prueba la otra ruta.
    }
  }
  return null
}

interface WindowsTerminalProfile {
  name?: string
  guid?: string
  commandline?: string
  source?: string
}

interface WindowsTerminalSettings {
  defaultProfile?: string
  profiles?: { list?: WindowsTerminalProfile[] }
}

/**
 * Traduce el perfil por defecto de Windows Terminal a una shell lanzable.
 *
 * El perfil puede venir de dos maneras:
 * - con `commandline` explícito (`%SystemRoot%\…\powershell.exe`), o
 * - como perfil DINÁMICO (los que Windows Terminal genera: PowerShell, PowerShell
 *   Core, Símbolo del sistema…), que traen `source` pero ningún `commandline`.
 */
export function shellFromWindowsTerminalProfile(
  probe: ShellProbe,
  settings: WindowsTerminalSettings
): TerminalShellCandidate | null {
  const list = settings.profiles?.list ?? []
  const wanted = normalizeGuid(settings.defaultProfile ?? '')
  const profile = wanted
    ? list.find((entry) => normalizeGuid(entry.guid ?? '') === wanted)
    : undefined
  if (!profile) return null
  return shellFromTerminalProfile(probe, profile)
}

/**
 * Traduce UN perfil de Windows Terminal a una shell lanzable.
 *
 * El perfil puede venir de dos maneras:
 * - con `commandline` explícito (`%SystemRoot%\…\powershell.exe`), o
 * - como perfil DINÁMICO (los que Windows Terminal genera: PowerShell, PowerShell
 *   Core, Símbolo del sistema…), que traen `source` pero ningún `commandline`.
 */
export function shellFromTerminalProfile(
  probe: ShellProbe,
  profile: WindowsTerminalProfile
): TerminalShellCandidate | null {
  const commandline = profile.commandline?.trim()
  if (commandline) {
    const { path: command, args } = parseCommandLine(commandline)
    if (!command) return null
    const expanded = expandWindowsEnv(command, probe.env)
    const resolved = isWindowsPath(expanded)
      ? probe.exists(expanded)
        ? expanded
        : null
      : probe.which(expanded) ?? probe.which(`${expanded}.exe`) ?? null
    if (!resolved) return null
    return {
      id: resolved,
      label: profile.name?.trim() || friendlyLabel(resolved),
      path: resolved,
      args,
      family: shellFamilyFor(resolved)
    }
  }

  // Perfil dinámico: el `source` dice qué ejecutable es.
  const dynamic = WT_DYNAMIC_PROFILES[profile.source ?? '']
  if (!dynamic) return null
  const resolved = probe.which(dynamic)
  if (!resolved) return null
  return {
    id: resolved,
    label: profile.name?.trim() || friendlyLabel(resolved),
    path: resolved,
    args: [],
    family: shellFamilyFor(resolved)
  }
}

/** `pwsh.exe` → `powershell.exe` → `cmd.exe`: el primero que exista. */
function detectFallbackShell(probe: ShellProbe): TerminalShellCandidate {
  const pwsh = probe.which('pwsh.exe')
  if (pwsh) return candidateFrom(pwsh, 'PowerShell 7')

  const powershell = probe.which('powershell.exe')
  if (powershell) return candidateFrom(powershell, 'Windows PowerShell')

  const comspec = probe.env.ComSpec ?? probe.env.COMSPEC
  if (comspec) return candidateFrom(comspec, 'Command Prompt')

  const cmd = probe.which('cmd.exe')
  if (cmd) return candidateFrom(cmd, 'Command Prompt')

  return candidateFrom('cmd.exe', 'Command Prompt')
}

function candidateFrom(executable: string, label?: string): TerminalShellCandidate {
  return {
    id: executable,
    label: label ?? friendlyLabel(executable),
    path: executable,
    args: [],
    family: shellFamilyFor(executable)
  }
}

/* ───────────────────────────────────────────────────────────────────────────
 * Candidatas para el selector de Ajustes
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Todas las shells que se pueden lanzar, con la detectada primero.
 *
 * La detectada va primera porque es la que se usa por defecto; detrás van las
 * demás que hay EN EL SISTEMA — nada de una lista de "posibles": cada candidata
 * entra sólo si el archivo existe de verdad.
 *
 * De dónde salen:
 * 1. **Los perfiles de Windows Terminal**: son las shells que el usuario tiene
 *    configuradas (Git Bash, WSL, los Developer Prompts…).
 * 2. **El PATH**.
 * 3. **Las rutas conocidas** donde suelen instalarse, aunque no estén en el PATH.
 */
export function listShellCandidates(probe: ShellProbe): TerminalShellInfo {
  const detected = resolveShell(probe)
  const candidates: TerminalShellCandidate[] = [detected]

  const add = (candidate: TerminalShellCandidate | null): void => {
    if (!candidate) return
    // Mismo ejecutable (misma ruta): no se repite.
    if (candidates.some((entry) => samePath(entry.path, candidate.path))) return
    // Mismo NOMBRE (Git\bin\bash.exe y Git\usr\bin\bash.exe son el mismo shell):
    // se deja el primero, que suele ser el del perfil por defecto.
    if (candidates.some((entry) => entry.label === candidate.label)) return
    candidates.push(candidate)
  }

  // 1. Perfiles de Windows Terminal.
  const settings = readWindowsTerminalSettings(probe)
  if (settings) {
    for (const profile of settings.profiles?.list ?? []) {
      add(shellFromTerminalProfile(probe, profile))
    }
  }

  // 2. El PATH.
  for (const name of SHELL_EXECUTABLES) {
    const found = probe.which(name)
    if (found) add(candidateFrom(found))
  }

  // 3. Rutas conocidas que no están en el PATH.
  for (const file of wellKnownShellPaths(probe.env)) {
    if (probe.exists(file)) add(candidateFrom(file))
  }

  return { detected, candidates }
}

/**
 * Ejecutables de shell que se buscan en el PATH.
 *
 * No es una lista de "shells que se ofrecen": es una lista de NOMBRES que se
 * buscan. El que no exista en la máquina no aparece nunca en el selector.
 */
const SHELL_EXECUTABLES = [
  'pwsh.exe',
  'powershell.exe',
  'cmd.exe',
  'bash.exe',
  'wsl.exe',
  'nu.exe',
  'fish.exe',
  'zsh.exe'
] as const

/**
 * Rutas donde suele instalarse una shell sin que quede en el PATH.
 *
 * Son rutas de Windows: se arman con `\` para que se vean igual que las que
 * devuelve el sistema.
 */
export function wellKnownShellPaths(env: Record<string, string | undefined>): string[] {
  const out: string[] = []
  const systemRoot = env.SystemRoot ?? env.SYSTEMROOT ?? 'C:\\Windows'
  const programFiles = env.ProgramFiles ?? env.PROGRAMFILES
  const localAppData = env.LOCALAPPDATA

  if (programFiles) {
    out.push(`${programFiles}\\PowerShell\\7\\pwsh.exe`)
    out.push(`${programFiles}\\PowerShell\\7-preview\\pwsh.exe`)
    out.push(`${programFiles}\\Git\\bin\\bash.exe`)
    out.push(`${programFiles}\\Git\\usr\\bin\\bash.exe`)
  }
  if (localAppData) {
    out.push(`${localAppData}\\Microsoft\\WindowsApps\\pwsh.exe`)
    out.push(`${localAppData}\\Programs\\Git\\bin\\bash.exe`)
  }
  out.push(`${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`)
  out.push(`${systemRoot}\\System32\\cmd.exe`)
  out.push(`${systemRoot}\\System32\\wsl.exe`)
  return out
}

/** Compara rutas sin distinguir mayúsculas ni separadores. */
function samePath(a: string, b: string): boolean {
  const normalize = (value: string): string =>
    value.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase()
  return normalize(a) === normalize(b)
}

/** ¿Es una ruta de Windows (con barra o con letra de unidad)? */
function isWindowsPath(value: string): boolean {
  return value.includes('\\') || /^[A-Za-z]:/.test(value)
}

/* ───────────────────────────────────────────────────────────────────────────
 * Helpers puros (testeables)
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Familia de una shell, según su nombre.
 *
 * `other` = no se sabe la sintaxis: no se le manda ningún `cd` antes que
 * mandarle uno equivocado.
 */
export function shellFamilyFor(command: string): ShellFamily {
  const base = baseName(command).toLowerCase().replace(/\.(exe|com|cmd|bat)$/, '')
  switch (base) {
    case 'cmd':
      return 'cmd'
    case 'pwsh':
    case 'powershell':
      return 'powershell'
    case 'bash':
    case 'sh':
    case 'zsh':
    case 'fish':
    case 'dash':
    case 'ksh':
    case 'ash':
      return 'posix'
    default:
      return 'other'
  }
}

/** Nombre legible de un ejecutable. */
export function friendlyLabel(executable: string): string {
  const base = baseName(executable).toLowerCase().replace(/\.(exe|com|cmd|bat)$/, '')
  switch (base) {
    case 'pwsh':
      return 'PowerShell 7'
    case 'powershell':
      return 'Windows PowerShell'
    case 'cmd':
      return 'Command Prompt'
    case 'bash':
      return executable.toLowerCase().includes('git') ? 'Git Bash' : 'Bash'
    case 'wsl':
      return 'WSL'
    default:
      return baseName(executable)
  }
}

/**
 * Nombre del archivo, sin depender de la plataforma.
 *
 * `path.basename` parte sólo por el separador del S.O. actual: en Linux
 * `path.basename('C:\\Windows\\cmd.exe')` devuelve la ruta entera. Como los
 * tests corren en Linux y en Windows, se parte por los dos.
 */
function baseName(command: string): string {
  const parts = command.split(/[\\/]/)
  return parts[parts.length - 1] ?? command
}

/** Normaliza un GUID de perfil: sin llaves y en minúsculas. */
export function normalizeGuid(guid: string): string {
  return guid.trim().replace(/^\{/, '').replace(/\}$/, '').toLowerCase()
}

/**
 * Parte una línea de comando en ejecutable + argumentos.
 *
 * Respeta comillas (simples y dobles): es lo que usan los `commandline` de
 * Windows Terminal y las rutas con espacios.
 */
export function parseCommandLine(line: string): { path: string; args: string[] } {
  const tokens: string[] = []
  let current = ''
  let quote: string | null = null
  let started = false

  for (const char of line.trim()) {
    if (quote) {
      if (char === quote) {
        quote = null
        continue
      }
      current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      started = true
      continue
    }
    if (/\s/.test(char)) {
      if (started) {
        tokens.push(current)
        current = ''
        started = false
      }
      continue
    }
    current += char
    started = true
  }
  if (started) tokens.push(current)

  const [command, ...args] = tokens
  return { path: command ?? '', args }
}

/**
 * Expande `%VAR%` (Windows) con el entorno.
 *
 * Los `commandline` de Windows Terminal vienen con `%SystemRoot%` y compañía.
 * En Windows las variables no distinguen mayúsculas: `Path` y `PATH` son la misma.
 */
export function expandWindowsEnv(text: string, env: Record<string, string | undefined>): string {
  return text.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (match, name: string) => {
    const value = envValue(env, name)
    return value ?? match
  })
}

function envValue(env: Record<string, string | undefined>, name: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(env, name)) return env[name]
  const lower = name.toLowerCase()
  for (const [key, value] of Object.entries(env)) {
    if (key.toLowerCase() === lower) return value
  }
  return undefined
}

/**
 * Quita comentarios y comas finales de un JSON con comentarios.
 *
 * El `settings.json` de Windows Terminal es JSONC: acepta `//` y `/* *\/`, y
 * el editor de Windows Terminal escribe comentarios si el usuario los agrega.
 */
export function stripJsonComments(text: string): string {
  let out = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]

    if (inString) {
      out += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') {
      inString = true
      out += char
      continue
    }
    if (char === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
      continue
    }
    if (char === '/' && next === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i++
      continue
    }
    out += char
  }

  // Comas finales: `"a": 1, }` → `"a": 1 }`.
  return out.replace(/,(\s*[}\]])/g, '$1')
}

/** Parsea un JSON con comentarios (el formato de Windows Terminal). */
export function parseJsonc(text: string): unknown {
  return JSON.parse(stripJsonComments(text))
}
