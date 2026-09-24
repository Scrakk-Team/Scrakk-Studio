// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Evaluador de cláusulas `when` (claves de contexto) — PURO y testeable.
 *
 * VS Code condiciona la UI de una extensión con expresiones sobre claves de
 * contexto: `views[].when`, `menus[].when`, `commands[].when`… El caso vivo en
 * Scrakk es la visibilidad de vistas y de botones de la activity bar, con las
 * claves que la extensión publica vía `commands.executeCommand('setContext')`.
 *
 * ── SUBCONJUNTO SOPORTADO (a propósito) ──────────────────────────────────
 *   clave            `chatEnabled`            (verdadero si es true o no vacío)
 *   negación         `!chatEnabled`
 *   comparación      `mode == 'edit'`, `count != 0`
 *   lógica           `a && b`, `a || b`, con paréntesis
 *   literales        `'texto'`, `"texto"`, números, `true`, `false`
 *
 * NO soporta `in`, `=~`, `key:value`, `instanceof` ni los predicados de VS
 * Code. Una expresión que no se puede parsear NO oculta UI: se considera
 * visible y se avisa UNA vez (ocultar algo que debería verse es peor que
 * mostrar algo de más).
 */

type Token =
  | { kind: 'key'; value: string }
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'op'; value: '!' | '&&' | '||' | '==' | '!=' }
  | { kind: 'paren'; value: '(' | ')' }

const TOKEN_RE = /[A-Za-z_][A-Za-z0-9_.\-]*|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\d+(?:\.\d+)?|&&|\|\||==|!=|!|\(|\)/g

function tokenize(source: string): Token[] | null {
  const tokens: Token[] = []
  let consumed = 0
  for (const match of source.matchAll(TOKEN_RE)) {
    const index = match.index ?? 0
    // Huecos con algo que no sea espacio: hay sintaxis que no soportamos.
    if (source.slice(consumed, index).trim().length > 0) return null
    consumed = index + match[0].length
    const text = match[0]
    if (text === '&&' || text === '||' || text === '==' || text === '!=' || text === '!') {
      tokens.push({ kind: 'op', value: text })
    } else if (text === '(' || text === ')') {
      tokens.push({ kind: 'paren', value: text })
    } else if (text === 'true' || text === 'false') {
      tokens.push({ kind: 'bool', value: text === 'true' })
    } else if (/^\d/.test(text)) {
      tokens.push({ kind: 'number', value: Number(text) })
    } else if (text.startsWith("'") || text.startsWith('"')) {
      tokens.push({ kind: 'string', value: text.slice(1, -1).replace(/\\(.)/g, '$1') })
    } else {
      tokens.push({ kind: 'key', value: text })
    }
  }
  if (source.slice(consumed).trim().length > 0) return null
  return tokens
}

/** ¿El valor de una clave cuenta como verdadero? */
function truthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value.length > 0
  return value !== undefined && value !== null
}

function looseEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'boolean' || typeof b === 'boolean') return truthy(a) === truthy(b)
  return a === b
}

const warned = new Set<string>()

/**
 * Evalúa una cláusula `when` contra un lector de claves de contexto.
 *
 * `undefined`/vacío = visible. Expresión no soportada = visible + aviso.
 */
export function evaluateWhen(
  expression: string | undefined,
  getKey: (key: string) => unknown
): boolean {
  if (expression === undefined) return true
  const trimmed = expression.trim()
  if (trimmed.length === 0) return true

  const tokens = tokenize(trimmed)
  if (tokens === null || tokens.length === 0) {
    warnOnce(trimmed)
    return true
  }

  let position = 0
  const peek = (): Token | undefined => tokens[position]
  const eat = (): Token | undefined => tokens[position++]

  /** Valor de un token primario (o null si no aplica). */
  const primary = (): { value: unknown } | null => {
    const token = eat()
    if (token === undefined) return null
    switch (token.kind) {
      case 'paren': {
        if (token.value === '(') {
          const inner = or()
          const close = eat()
          if (inner === null || close?.kind !== 'paren' || close.value !== ')') return null
          return inner
        }
        return null
      }
      case 'op': {
        if (token.value !== '!') return null
        const operand = primary()
        if (operand === null) return null
        return { value: !truthy(operand.value) }
      }
      case 'string':
      case 'number':
      case 'bool':
        return { value: token.value }
      case 'key':
        return { value: getKey(token.value) }
      default:
        return null
    }
  }

  const comparison = (): { value: unknown } | null => {
    const left = primary()
    if (left === null) return null
    const next = peek()
    if (next?.kind !== 'op' || (next.value !== '==' && next.value !== '!=')) return left
    eat()
    const right = primary()
    if (right === null) return null
    const equal = looseEqual(left.value, right.value)
    return { value: next.value === '==' ? equal : !equal }
  }

  const and = (): { value: unknown } | null => {
    let left = comparison()
    if (left === null) return null
    while (peek()?.kind === 'op' && (peek() as { value: string }).value === '&&') {
      eat()
      const right = comparison()
      if (right === null) return null
      left = { value: truthy(left.value) && truthy(right.value) }
    }
    return left
  }

  function or(): { value: unknown } | null {
    let left = and()
    if (left === null) return null
    while (peek()?.kind === 'op' && (peek() as { value: string }).value === '||') {
      eat()
      const right = and()
      if (right === null) return null
      left = { value: truthy(left.value) || truthy(right.value) }
    }
    return left
  }

  const result = or()
  if (result === null || position !== tokens.length) {
    warnOnce(trimmed)
    return true
  }
  return truthy(result.value)
}

function warnOnce(expression: string): void {
  if (warned.has(expression)) return
  warned.add(expression)
  console.warn(
    `[extensions/when] expresión no soportada: "${expression}" — se considera visible`
  )
}

/** Solo tests: limpia los avisos ya emitidos. */
export function _resetWhenWarningsForTests(): void {
  warned.clear()
}
