/**
 * Reglas de permisos — porte de `st-scrakk-workspace/src/permission/{rules,policy}.rs`.
 *
 * DSL idéntica a la del CLI/Claude:
 *   `Bash(npm run build)`  `Bash(git push:*)`  `Read(src/**)`  `Edit(**)`
 *   `Grep(**\/.env)`  `WebFetch(domain:example.com)`  `WebSearch`  `MCPTool(name)`
 *   `Bash` (sin paréntesis = toda la tool)
 *
 * Evaluación: deny > ask > allow (independiente del orden), como el CLI.
 */

export type RuleAction = 'allow' | 'ask' | 'deny'
export type PatternMode = 'glob' | 'domain'
export type ToolFilter =
  | 'any'
  | 'bash'
  | 'read'
  | 'edit'
  | 'grep'
  | 'mcp'
  | 'web_fetch'
  | 'web_search'

export interface PermissionRule {
  action: RuleAction
  tool: ToolFilter
  /** null = toda la tool. */
  pattern: string | null
  patternMode: PatternMode
  /**
   * Modos a los que aplica la regla. Vacío/undefined = todos los modos.
   * Permite "desactivar un comando solo en ciertos modos".
   */
  modes?: string[]
}

/** Una regla tal como se escribe en el archivo: string suelta o con modos. */
export type PermissionRuleEntry = string | { rule: string; modes?: string[] }

/** Acceso que un tool call pide. Espeja `AccessKind` del CLI. */
export type AccessKind =
  | { kind: 'bash'; command: string }
  | { kind: 'read'; path: string | null }
  | { kind: 'edit'; path: string }
  | { kind: 'grep'; path: string | null }
  | { kind: 'mcp'; name: string }
  | { kind: 'web_fetch'; url: string }
  | { kind: 'web_search'; query: string }

export type PolicyVerdict = 'allow' | 'ask' | 'deny' | null

const TOOL_FILTERS: Record<string, ToolFilter> = {
  Bash: 'bash',
  Read: 'read',
  NotebookRead: 'read',
  Edit: 'edit',
  Write: 'edit',
  NotebookEdit: 'edit',
  MCPTool: 'mcp',
  Grep: 'grep',
  Glob: 'grep',
  WebFetch: 'web_fetch',
  WebSearch: 'web_search'
}

/** Primer `(` sin escapar, o -1. */
function firstUnescaped(text: string, target: string): number {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== target) continue
    let backslashes = 0
    let j = i - 1
    while (j >= 0 && text[j] === '\\') {
      backslashes++
      j--
    }
    if (backslashes % 2 === 0) return i
  }
  return -1
}

function lastUnescaped(text: string, target: string): number {
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] !== target) continue
    let backslashes = 0
    let j = i - 1
    while (j >= 0 && text[j] === '\\') {
      backslashes++
      j--
    }
    if (backslashes % 2 === 0) return i
  }
  return -1
}

function unescapeContent(text: string): string {
  return text.replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\')
}

/**
 * Parsea una regla. Devuelve null si es inválida (prefijo desconocido o
 * paréntesis sin cerrar) — tolerante, como el CLI que la descarta con warning.
 */
export function parsePermissionRule(
  raw: string,
  action: RuleAction,
  modes?: string[]
): PermissionRule | null {
  const rule = raw.trim()
  const openParen = firstUnescaped(rule, '(')
  if (openParen === -1) {
    const tool = TOOL_FILTERS[rule]
    if (tool) {
      return { action, tool, pattern: null, patternMode: 'glob', modes }
    }
    return { action, tool: 'any', pattern: rule || null, patternMode: 'glob', modes }
  }

  const prefix = rule.slice(0, openParen).trim()
  const rest = rule.slice(openParen + 1)
  const closeParen = lastUnescaped(rest, ')')
  if (closeParen === -1) return null

  const tool = TOOL_FILTERS[prefix]
  if (!tool) return null

  const rawContent = rest.slice(0, closeParen).trim()
  let pattern = rawContent === '' || rawContent === '*' ? '' : unescapeContent(rawContent)
  // `Bash(cmd:*)` = prefijo `cmd` (no un glob, que no matchearía nada).
  if (tool === 'bash' && pattern.endsWith(':*')) pattern = pattern.slice(0, -2)

  let patternMode: PatternMode = 'glob'
  if (pattern.startsWith('domain:')) {
    pattern = pattern.slice('domain:'.length)
    patternMode = 'domain'
  }

  return { action, tool, pattern: pattern || null, patternMode, modes }
}

/** Normaliza una entrada de lista: string suelta u objeto `{ rule, modes }`. */
function normalizeEntry(value: unknown): { rule: string; modes?: string[] } | null {
  if (typeof value === 'string') return { rule: value }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.rule === 'string') {
      const modes = Array.isArray(record.modes)
        ? record.modes.filter((mode): mode is string => typeof mode === 'string')
        : undefined
      return { rule: record.rule, modes: modes && modes.length > 0 ? modes : undefined }
    }
  }
  return null
}

/**
 * Parsea listas `allow`/`ask`/`deny` de un objeto `permissions`. Cada entrada
 * puede ser un string (aplica a todos los modos) u `{ rule, modes }`.
 * `defaultModes` se usa cuando la entrada no trae sus propios modos.
 */
export function parsePermissionLists(
  input: {
    allow?: unknown
    ask?: unknown
    deny?: unknown
  },
  defaultModes?: string[]
): { rules: PermissionRule[]; warnings: string[] } {
  const rules: PermissionRule[] = []
  const warnings: string[] = []
  const groups: Array<[RuleAction, unknown]> = [
    ['allow', input.allow],
    ['deny', input.deny],
    ['ask', input.ask]
  ]
  for (const [action, list] of groups) {
    if (!Array.isArray(list)) continue
    for (const raw of list) {
      const entry = normalizeEntry(raw)
      if (!entry) continue
      const parsed = parsePermissionRule(entry.rule, action, entry.modes ?? defaultModes)
      if (parsed) rules.push(parsed)
      else warnings.push(`permissions.${action}: ${entry.rule} -- regla inválida`)
    }
  }
  return { rules, warnings }
}

/**
 * Parsea el bloque `modeRules` del archivo:
 *   `{ "plan": { "deny": ["Bash(git push:*)"] } }`
 * Cada regla queda acotada al modo de su clave (salvo que traiga `modes`).
 */
export function parseModeRules(
  input: unknown
): { rules: PermissionRule[]; warnings: string[] } {
  const rules: PermissionRule[] = []
  const warnings: string[] = []
  if (!input || typeof input !== 'object') return { rules, warnings }
  for (const [modeId, lists] of Object.entries(input as Record<string, unknown>)) {
    if (!lists || typeof lists !== 'object') continue
    const parsed = parsePermissionLists(
      lists as { allow?: unknown; ask?: unknown; deny?: unknown },
      [modeId]
    )
    rules.push(...parsed.rules)
    warnings.push(...parsed.warnings.map((warning) => `modeRules.${modeId}: ${warning}`))
  }
  return { rules, warnings }
}

// ── Matching ───────────────────────────────────────────────────────────────

/** Glob → regex. `*` no cruza `/` en modo path; `**` sí. */
function globToRegex(glob: string, pathMode: boolean): RegExp {
  let out = '^'
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]
    if (char === '*') {
      if (glob[i + 1] === '*') {
        i++
        // `**/` matchea cero o más segmentos de path (igual que el glob del CLI).
        if (glob[i + 1] === '/') {
          i++
          out += '(?:.*/)?'
        } else {
          out += '.*'
        }
      } else {
        out += pathMode ? '[^/]*' : '.*'
      }
    } else if (char === '?') {
      out += pathMode ? '[^/]' : '.'
    } else if ('\\^$.|+()[]{}'.includes(char)) {
      out += `\\${char}`
    } else {
      out += char
    }
  }
  return new RegExp(`${out}$`)
}

function globMatches(text: string, pattern: string, pathMode: boolean): boolean {
  return globToRegex(pattern, pathMode).test(text)
}

function normalizeDomain(value: string): string {
  return value.toLowerCase().replace(/^www\./, '').replace(/\/+$/, '')
}

function domainMatches(pattern: string, url: string): boolean {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return false
  }
  const domain = normalizeDomain(host)
  const normalizedPattern = normalizeDomain(pattern)
  return domain === normalizedPattern || domain.endsWith(`.${normalizedPattern}`)
}

function toolMatches(access: AccessKind, filter: ToolFilter): boolean {
  switch (filter) {
    case 'any':
      return true
    case 'bash':
      return access.kind === 'bash'
    case 'edit':
      return access.kind === 'edit'
    // Una regla de Read también gobierna Grep (grep lee archivos).
    case 'read':
      return access.kind === 'read' || access.kind === 'grep'
    case 'grep':
      return access.kind === 'grep'
    case 'mcp':
      return access.kind === 'mcp'
    case 'web_fetch':
      return access.kind === 'web_fetch'
    case 'web_search':
      return access.kind === 'web_search'
  }
}

function patternMatches(access: AccessKind, rule: PermissionRule): boolean {
  const pattern = rule.pattern
  if (pattern === null || pattern === '*') return true

  switch (access.kind) {
    case 'bash': {
      const command = access.command.replace(/^\s+/, '')
      return command.startsWith(pattern) || globMatches(command, pattern, false)
    }
    case 'edit':
      return globMatches(access.path, pattern, true)
    case 'read':
      return access.path !== null && globMatches(access.path, pattern, true)
    case 'grep':
      return access.path !== null && globMatches(access.path, pattern, true)
    case 'mcp':
      return globMatches(access.name, pattern, false)
    case 'web_fetch':
      return rule.patternMode === 'domain'
        ? domainMatches(pattern, access.url)
        : globMatches(access.url, pattern, false)
    case 'web_search':
      return globMatches(access.query, pattern, false) || access.query.startsWith(pattern)
  }
}

/**
 * Evalúa con precedencia deny > ask > allow. `null` = ninguna regla matcheó
 * (el modo decide). Si la regla está acotada a modos, solo aplica cuando
 * `modeId` coincide.
 */
export function evaluatePermissionRules(
  access: AccessKind,
  rules: PermissionRule[],
  modeId?: string
): PolicyVerdict {
  let matchedAsk = false
  let matchedAllow = false
  for (const rule of rules) {
    if (rule.modes && rule.modes.length > 0) {
      if (modeId === undefined || !rule.modes.includes(modeId)) continue
    }
    if (!toolMatches(access, rule.tool)) continue
    if (!patternMatches(access, rule)) continue
    if (rule.action === 'deny') return 'deny'
    if (rule.action === 'ask') matchedAsk = true
    else matchedAllow = true
  }
  if (matchedAsk) return 'ask'
  if (matchedAllow) return 'allow'
  return null
}
