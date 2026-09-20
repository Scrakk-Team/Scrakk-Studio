/**
 * Modo `auto` — fast-paths y heurístico (porte de `auto_mode.rs` de scrakk-cli).
 *
 * El CLI usa un clasificador por LLM para lo dudoso; acá replicamos lo
 * determinístico: allowlist segura, edits auto-aprobados, comandos de shell
 * "rutinarios" (read-only / build / test) y no-ops. Lo que no se puede probar
 * seguro se trata como "preguntar" (el LLM no está disponible en el IDE).
 */

import type { AccessKind } from './permissionRules'

export type AutoVerdict = 'allow' | 'ask'

/** Prefijos de comandos rutinarios (idénticos a `ROUTINE_PREFIXES` del CLI). */
const ROUTINE_PREFIXES: string[] = [
  'cargo ', 'git status', 'git diff', 'git log', 'git branch', 'git add', 'git commit',
  'git checkout', 'git switch', 'git stash', 'git pull', 'git fetch', 'git show', 'git blame',
  'git grep', 'git ls-files', 'git rev-parse', 'git describe', 'git merge-base', 'git worktree list',
  'pytest', 'python ', 'python3 ', 'node ', 'rustc ', 'rustfmt', 'clippy', 'make ', 'cmake ',
  'cd', 'pushd', 'popd', 'ls', 'pwd', 'echo ', 'printf ', 'cat ', 'head ', 'tail ', 'wc ', 'rg ',
  'grep ', 'which ', 'type ', 'true', 'false', 'test ', 'sort ', 'uniq ', 'tr ', 'cut ', 'diff ',
  'jq ', 'date', 'whoami', 'hostname', 'uname', 'nproc', 'printenv', 'stat ', 'file ', 'tree',
  'basename ', 'dirname ', 'realpath ', 'readlink ', 'strings ', 'sleep ', 'df ', 'du ', 'ps ',
  'top', 'htop', 'bazel ', 'just ', 'go ', 'kubectl get', 'kubectl logs', 'kubectl describe', 'set'
]

const NPM_SAFE_SUBCOMMANDS = new Set([
  'install', 'i', 'ci', 'add', 'remove', 'rm', 'uninstall', 'update', 'up', 'upgrade',
  'test', 't', 'run', 'run-script', 'start', 'build', 'audit', 'list', 'ls', 'll', 'outdated',
  'why', 'view', 'info', 'dedupe', 'prune', 'version', 'pack', 'config', 'link', 'unlink',
  'rebuild', 'store', 'fetch', 'import'
])

const UV_SAFE_SUBCOMMANDS = new Set([
  'sync', 'pip', 'lock', 'venv', 'add', 'remove', 'tree', 'export', 'build', 'version',
  'python', 'cache', 'init', 'self', 'help'
])

const RUSTUP_SAFE_SUBCOMMANDS = new Set([
  'show', 'toolchain', 'component', 'target', 'default', 'update', 'which', 'doc', 'self',
  'completions', 'set', 'override'
])

/** Claves de env "cosméticas": no cambian qué binario corre. */
const SAFE_ENV_KEYS = new Set([
  'CARGO_TERM_COLOR', 'CARGO_TERM_PROGRESS_WHEN', 'RUST_LOG', 'RUST_LOG_STYLE', 'RUST_BACKTRACE',
  'RUST_TEST_THREADS', 'RUST_MIN_STACK', 'NO_COLOR', 'CLICOLOR', 'CLICOLOR_FORCE', 'FORCE_COLOR',
  'COLORTERM'
])

const FIND_ACTIONS = new Set([
  '-delete', '-exec', '-execdir', '-ok', '-okdir', '-fprint', '-fprint0', '-fprintf', '-fls'
])

const GH_READ_ONLY_GROUPS = new Set(['pr', 'issue', 'release', 'run', 'workflow', 'repo', 'gist'])
const GH_READ_ONLY_SUBS = new Set(['view', 'list', 'status', 'checks', 'diff'])

const WRAPPERS_TO_PEEL = new Set(['env', 'timeout', 'nice', 'stdbuf', 'ionice', 'chrt'])
const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'uv', 'rustup'])

function basename(word: string): string {
  return word.split(/[/\\]/).pop()?.toLowerCase() ?? word.toLowerCase()
}

/** Saca asignaciones `NAME=VALUE` iniciales; false si alguna clave no es segura. */
function stripEnvAssignments(words: string[]): { rest: string[]; safe: boolean } {
  let index = 0
  let safe = true
  while (index < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index])) {
    const key = words[index].slice(0, words[index].indexOf('='))
    if (!SAFE_ENV_KEYS.has(key)) safe = false
    index++
  }
  return { rest: words.slice(index), safe }
}

/** Pela wrappers conocidos (env/timeout/nice/…) conservando el programa real. */
function unwrap(words: string[]): string[] {
  let current = words
  for (let guard = 0; guard < 6; guard++) {
    if (current.length === 0) return current
    if (WRAPPERS_TO_PEEL.has(basename(current[0]))) {
      // Salta el wrapper y sus flags/valores hasta el primer no-flag.
      let index = 1
      while (index < current.length && (current[index].startsWith('-') || /^\d+(\.\d+)?[a-z]*$/.test(current[index]))) {
        index++
      }
      current = current.slice(index)
      continue
    }
    const stripped = stripEnvAssignments(current)
    if (!stripped.safe) return ['__unsafe_env__']
    if (stripped.rest.length !== current.length) {
      current = stripped.rest
      continue
    }
    return current
  }
  return current
}

function subcommand(words: string[]): string | null {
  for (const word of words.slice(1)) {
    if (!word.startsWith('-')) return word.toLowerCase()
    if (word.includes('=')) continue
  }
  return null
}

/** Un comando es rutinario si su head está en la allowlist (word-boundary). */
function commandIsRoutine(wordsRaw: string[]): boolean {
  const words = unwrap(wordsRaw)
  if (words.length === 0) return true
  if (words[0] === '__unsafe_env__') return false
  const head = basename(words[0])
  const sub = subcommand(words)

  if (PACKAGE_MANAGERS.has(head)) {
    if (sub === null) return false
    if (head === 'npm' || head === 'pnpm' || head === 'yarn') return NPM_SAFE_SUBCOMMANDS.has(sub)
    if (head === 'uv') return UV_SAFE_SUBCOMMANDS.has(sub)
    return RUSTUP_SAFE_SUBCOMMANDS.has(sub)
  }
  if (head === 'find') return !words.some((w) => FIND_ACTIONS.has(w))
  if (head === 'gh') {
    const tokens = words.slice(1).filter((w) => !w.startsWith('-'))
    if (tokens.length === 1 && tokens[0] === 'status') return true
    if (tokens.length >= 2) return GH_READ_ONLY_GROUPS.has(tokens[0]) && GH_READ_ONLY_SUBS.has(tokens[1])
    return false
  }

  const joined = words.join(' ').toLowerCase()
  return ROUTINE_PREFIXES.some((prefix) => {
    const base = prefix.trim()
    return joined === base || (joined.startsWith(base) && joined[base.length] === ' ')
  })
}

/** Redirects a un destino no-seguro (o cualquier `>` que no sea /dev/null). */
function writesUnsafePath(command: string): boolean {
  const redirects = command.match(/>>?\s*([^\s;&|]+)/g) ?? []
  for (const redirect of redirects) {
    const target = redirect.replace(/^>>?\s*/, '')
    if (!target.startsWith('/dev/null')) return true
  }
  return false
}

/**
 * Veredicto heurístico para un comando de shell (fail-closed): `allow` solo si
 * TODOS los segmentos son rutinarios; `ask` si no se puede probar.
 */
export function heuristicBashVerdict(command: string): AutoVerdict {
  const cmd = command.trim()
  if (!cmd) return 'allow'
  if (['true', ':', 'false'].includes(cmd)) return 'allow'
  // Fail-closed: sustituciones, expansiones y background.
  if (/[$`]|&\s*$/.test(cmd)) return 'ask'
  if (writesUnsafePath(cmd)) return 'ask'

  const segments = cmd
    .split(/&&|\|\||;|\||\n/)
    .map((segment) => segment.trim())
    .filter(Boolean)
  if (segments.length === 0) return 'ask'

  for (const segment of segments) {
    // No soportamos la sintaxis de shell compleja (subshells/bloques): preguntar.
    if (/[(){}]/.test(segment)) return 'ask'
    if (!commandIsRoutine(segment.split(/\s+/))) return 'ask'
  }
  return 'allow'
}

/** Tool names de metadata/coordinación que nunca necesitan confirmación. */
const ALLOWLISTED_TOOL_NAMES = new Set([
  'list_directory', 'file_search', 'grep_search', 'read_file', 'read_multiple_files',
  'list_skills', 'skill', 'web_search', 'web_fetch', 'history_title', 'get_diagnostics'
])

export interface AutoModeInput {
  access: AccessKind | null
  toolName: string
}

/**
 * Veredicto del modo `auto`: allowlist/edits/no-ops → allow; shell rutinario →
 * allow; todo lo demás → ask (en el CLI iría al clasificador LLM).
 */
export function autoModeVerdict({ access, toolName }: AutoModeInput): AutoVerdict {
  if (ALLOWLISTED_TOOL_NAMES.has(toolName)) return 'allow'
  if (!access) return 'allow'
  if (access.kind === 'read' || access.kind === 'grep' || access.kind === 'web_search') return 'allow'
  if (access.kind === 'web_fetch') return 'allow'
  // Auto acepta TODAS las ediciones (decisión de producto del CLI).
  if (access.kind === 'edit') return 'allow'
  if (access.kind === 'mcp') return 'ask'
  return heuristicBashVerdict(access.command)
}
