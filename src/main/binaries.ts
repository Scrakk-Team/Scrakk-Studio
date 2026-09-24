// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Dónde viven los ejecutables del sistema — y por qué el PATH NO alcanza.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL BUG QUE ESTO ARREGLA
 *
 * Una app de escritorio arranca de dos maneras y el PATH es DISTINTO en cada una:
 *
 *   1. Desde una terminal (`npm run dev`, o el binario a mano): hereda el PATH
 *      del shell, con nvm/fnm/volta/asdf/~/.local/bin ya cargados. Todo se
 *      encuentra: `npm`, `node`, `git`, los language servers.
 *   2. Desde el menú / el ícono del escritorio (el caso NORMAL del usuario): el
 *      entorno lo arma el gestor de sesiones y trae el PATH base del sistema
 *      (`/usr/local/bin:/usr/bin:/bin`). Nada de nvm, nada de ~/.local/bin
 *      (que es donde `npm i -g` sin sudo deja los globales en varias distros).
 *
 * Resultado: la MISMA build "funciona en dev" y en prod pierde el LSP, no
 * encuentra git, y no puede instalar servers — sin un solo error visible, porque
 * el fallo es un ENOENT de un spawn. Eso se leía como "el resaltado se ve
 * incompleto sólo en prod" (sin semantic tokens del server) y como "a mi amigo
 * no le sirvió en su Linux" (en su distro node vive en nvm, en la tuya en
 * /usr/bin).
 *
 * La cura no es adivinar en cada call site: se AUMENTA una vez el PATH del
 * proceso main, y todo lo que se spawnee después (LSP, git, terminal, el host de
 * extensiones) hereda el mismo entorno que tendría en una terminal.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * REGLAS
 *
 *  - Lo que ya está en el PATH MANDA: los directorios extra se AGREGAN al final,
 *    así el usuario que lanzó desde una terminal no ve cambiar ninguna
 *    precedencia.
 *  - Sólo se agregan directorios que EXISTEN (un PATH lleno de rutas muertas es
 *    un PATH que miente en los diagnósticos).
 *  - Idempotente: llamarlo dos veces no duplica entradas.
 *  - `resolveExecutable` no depende de `which`/`where`: los propios comandos de
 *    búsqueda faltan en instalaciones mínimas, y usar un binario del PATH para
 *    saber qué hay en el PATH es circular.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

/** `PATHEXT` de Windows: un ejecutable puede ser `npm`, `npm.cmd`, `npm.exe`… */
const WINDOWS_EXEC_EXTENSIONS = ['.cmd', '.exe', '.bat', '.ps1', '']

/**
 * Versiones de node instaladas por un gestor de versiones.
 *
 * nvm/fnm/n/volta no dejan el binario en un directorio fijo: lo dejan en
 * `<gestor>/versions/node/<vX.Y.Z>/bin`. Se toma la versión más ALTA (el orden
 * de `readdirSync` es alfabético y `v9` > `v20` alfabéticamente, así que se
 * compara por número, no por string) y se ignoran los layouts que no existan.
 */
function versionManagerBinDirs(home: string): string[] {
  const out: string[] = []
  const layouts: Array<[string, (entries: string[]) => string | undefined]> = [
    [path.join(home, '.nvm', 'versions', 'node'), (entries) => highestNodeVersion(entries)],
    [
      path.join(home, '.local', 'share', 'fnm', 'node-versions'),
      (entries) => highestNodeVersion(entries)
    ],
    [path.join(home, 'n', 'versions', 'node'), (entries) => highestNodeVersion(entries)]
  ]

  for (const [dir, pick] of layouts) {
    let entries: string[]
    try {
      entries = fs.readdirSync(dir)
    } catch {
      continue
    }
    const chosen = pick(entries)
    if (!chosen) continue
    // fnm mete un nivel extra (`<v>/installation/bin`); nvm/n van directo a
    // `<v>/bin`. Se agregan los dos candidatos y el filtro de existencia de
    // `extraBinDirs` descarta el que no corresponda.
    out.push(path.join(dir, chosen, 'bin'))
    out.push(path.join(dir, chosen, 'installation', 'bin'))
  }
  return out
}

/** La versión de Node más alta de una lista tipo `v20.11.0` / `v18.19.0`. */
function highestNodeVersion(entries: string[]): string | undefined {
  const parsed = entries
    .map((name) => ({ name, version: name.match(/^v?(\d+)\.(\d+)\.(\d+)/) }))
    .filter((entry): entry is { name: string; version: RegExpMatchArray } => entry.version !== null)
    .map((entry) => ({
      name: entry.name,
      major: Number(entry.version[1]),
      minor: Number(entry.version[2]),
      patch: Number(entry.version[3])
    }))
    .sort((a, b) => b.major - a.major || b.minor - a.minor || b.patch - a.patch)
  return parsed[0]?.name
}

/**
 * Directorios extra que se agregan al PATH, en orden de prioridad.
 *
 * Todo lo que la app puede necesitar en runtime: `node`/`npm`/`npx` (LSP y
 * extensiones de panels), `git` (panel de control de versiones), y las rutas de
 * los gestores de paquetes de Linux (snap, linuxbrew, pnpm).
 */
export function extraBinDirs(
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
  platform: NodeJS.Platform = process.platform
): string[] {
  if (platform === 'win32') {
    const appData = env['APPDATA'] ?? path.join(home, 'AppData', 'Roaming')
    const localAppData = env['LOCALAPPDATA'] ?? path.join(home, 'AppData', 'Local')
    const programFiles = env['ProgramFiles'] ?? 'C:\\Program Files'
    return [
      path.join(appData, 'npm'),
      path.join(localAppData, 'Volta', 'bin'),
      path.join(home, '.volta', 'bin'),
      path.join(programFiles, 'nodejs'),
      path.join(localAppData, 'pnpm'),
      path.join(localAppData, 'Yarn', 'bin')
    ]
  }

  return [
    path.join(home, '.local', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    ...versionManagerBinDirs(home),
    path.join(home, '.volta', 'bin'),
    path.join(home, '.fnm', 'aliases', 'default', 'bin'),
    path.join(home, '.asdf', 'shims'),
    path.join(home, '.local', 'share', 'pnpm'),
    path.join(home, '.yarn', 'bin'),
    path.join(home, '.bun', 'bin'),
    path.join(home, '.linuxbrew', 'bin'),
    '/home/linuxbrew/.linuxbrew/bin',
    '/opt/homebrew/bin',
    '/snap/bin',
    '/usr/local/bin',
    '/usr/local/sbin',
    '/usr/bin',
    '/usr/sbin',
    '/bin',
    '/sbin'
  ]
}

/**
 * PATH completo: el del proceso primero (precedencia intacta) y los extra
 * después, sin duplicados y sin directorios inexistentes.
 */
export function augmentedPath(
  current: string | undefined = process.env.PATH,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
  platform: NodeJS.Platform = process.platform
): string {
  const separator = platform === 'win32' ? ';' : ':'
  const seen = new Set<string>()
  const out: string[] = []

  const push = (dir: string, requireExists: boolean): void => {
    if (!dir) return
    const normalized = platform === 'win32' ? dir.toLowerCase() : dir
    if (seen.has(normalized)) return
    if (requireExists) {
      try {
        if (!fs.statSync(dir).isDirectory()) return
      } catch {
        return
      }
    }
    seen.add(normalized)
    out.push(dir)
  }

  for (const dir of (current ?? '').split(separator)) push(dir, false)
  for (const dir of extraBinDirs(env, home, platform)) push(dir, true)
  return out.join(separator)
}

/**
 * Aumenta el PATH del proceso main. Se llama UNA vez al arrancar, antes de que
 * cualquier cosa spawnee: todo hijo (LSP, git, PTY de la terminal, host de
 * extensiones) hereda `process.env` y por lo tanto queda con el mismo entorno
 * que tendría en una terminal.
 */
export function applyPathAugmentation(): void {
  const next = augmentedPath()
  if (next !== process.env.PATH) process.env.PATH = next
}

/**
 * Resuelve un ejecutable a ruta absoluta, sin depender de `which`/`where`.
 *
 * Devuelve `null` si no existe. Acepta rutas absolutas/relativas tal cual (el
 * usuario puede fijar `/home/x/.local/bin/mi-server` en su config) y, para el
 * resto, recorre el PATH AUMENTADO.
 */
export function resolveExecutable(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = os.homedir()
): string | null {
  if (!command) return null
  const separator = platform === 'win32' ? ';' : ':'

  if (command.includes('/') || command.includes('\\')) {
    return isExecutableFile(command, platform) ? path.resolve(command) : null
  }

  const pathValue = env.PATH ?? ''
  const dirs = pathValue
    .split(separator)
    .filter(Boolean)
    .concat(extraBinDirs(env, home, platform))
  const extensions = platform === 'win32' ? WINDOWS_EXEC_EXTENSIONS : ['']

  for (const dir of dirs) {
    for (const extension of extensions) {
      const candidate = path.join(dir, command + extension)
      if (isExecutableFile(candidate, platform)) return candidate
    }
  }
  return null
}

/** ¿Es un archivo ejecutable? (en POSIX hay que mirar el bit; en Windows no) */
export function isExecutableFile(file: string, platform: NodeJS.Platform = process.platform): boolean {
  try {
    const stat = fs.statSync(file)
    if (!stat.isFile()) return false
    if (platform === 'win32') return true
    fs.accessSync(file, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}
