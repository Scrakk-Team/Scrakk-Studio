/**
 * Selectores de scope — EL resolutor de estilos del editor.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE ESTE ARCHIVO (y por qué es lo primero que hay que hacer)
 *
 * Hoy hay TRES fuentes de color y cada una resuelve a su manera:
 *
 *   1. tree-sitter dentro del engine → `MapCaptureColor()` en C++, que decide
 *      con `substring` y 15 campos fijos del tema.
 *   2. TextMate (`.tmLanguage` de una extensión de VS Code) → todavía no corre.
 *   3. semantic tokens del LSP → llegan con tokenType/modifier y se pintan aparte.
 *
 * Eso son tres verdades y un techo de 15 colores. Pero hay un hecho que las
 * unifica: **un capture de tree-sitter (`@type.builtin`, `@variable.parameter`)
 * y un scope de TextMate (`type.builtin.ts`) son el MISMO espacio de nombres
 * con puntos**. Entonces no hacen falta tres resolutores: hacen falta fuentes
 * que produzcan `(rango, scope)` y UN resolutor que diga el estilo.
 *
 * La semántica es la de VS Code (`colorThemeData.ts` → `nameMatcher` y
 * `textMateScopeMatcher.ts` → `createMatchers`), copiada a propósito: un tema
 * de VS Code tiene que resolver IGUAL acá. Diferencias deliberadas: `0` y `-1`
 * se devuelven explícitos para poder testear "no matchea".
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Un scope stack de un token, de MÁS EXTERNO a MÁS INTERNO.
 *
 * Ejemplo para `function foo()` en JS:
 * `['source.js', 'meta.function.js', 'entity.name.function.js']`
 * El último es el más específico y por eso pesa más en el score.
 */
export type ScopeStack = string[]

/** Resultado del match: -1 = no matchea, >= 0 = score (más alto = más específico). */
export const NO_MATCH = -1

/**
 * ¿`thisScope` es igual a `target`, o cuelga de él por punto?
 *
 * `keyword.control.flow.js` matchea el selector `keyword` y `keyword.control`,
 * pero NO `keywordx` ni `control` (tiene que ser prefijo por punto).
 */
export function scopeMatches(thisScope: string, target: string): boolean {
  if (!thisScope || !target) return false
  // Un capture de tree-sitter se escribe `@variable.parameter`: el `@` marca
  // que es un capture y NO es parte del nombre. Se normaliza acá (y no en
  // quien construye el stack) para que `@variable.parameter` y
  // `variable.parameter.function.js` matcheen contra los MISMOS selectores:
  // ésa es la unificación que sostiene todo `legend.ts`.
  const scope = thisScope.charCodeAt(0) === 64 /* @ */ ? thisScope.slice(1) : thisScope
  if (scope === target) return true
  return scope.length > target.length && scope.startsWith(target) && scope[target.length] === '.'
}

/**
 * Score de UN conjunto de identificadores (una conjunción: `a b` exige ambos).
 *
 * Fiel a VS Code:
 *  - recorre el stack de atrás hacia adelante (lo interno pesa más);
 *  - `score = (indexEnElStack + 1) * 0x10000 + longitudDelIdentificador`
 *    → primero gana "estar más adentro", y a igual profundidad gana el
 *    identificador más largo (el más específico);
 *  - si CUALQUIER identificador no matchea, no hay match.
 */
export function matchNames(identifiers: string[], scopes: ScopeStack): number {
  if (identifiers.length === 0) return NO_MATCH
  if (scopes.length < identifiers.length) return NO_MATCH

  let score: number | undefined
  for (const identifier of identifiers) {
    let found = false
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopeMatches(scopes[i], identifier)) {
        score = (i + 1) * 0x10000 + identifier.length
        found = true
        break
      }
    }
    if (!found) return NO_MATCH
  }
  return score ?? NO_MATCH
}

/** Un matcher ya parseado: la conjunción a evaluar + su prioridad explícita. */
export interface ScopeMatcher {
  identifiers: string[]
  /** `R:` = 1 (gana empates), `L:` = -1 (pierde empates), sin prefijo = 0. */
  priority: -1 | 0 | 1
  negated: boolean
}

/**
 * Parsea un selector de scope con la gramática de VS Code:
 *
 *   `,`      alternativas           → `keyword, storage`
 *   ` `      conjunción             → `meta.function entity.name`
 *   `-`      negación               → `-comment`
 *   `()`     agrupación             → `(a b)`
 *   `R:`/`L:` prioridad explícita   → `R:string`
 *
 * Devuelve la lista de alternativas (basta con que UNA matchee).
 */
export function parseScopeSelector(selector: string): ScopeMatcher[] {
  const text = selector.trim()
  if (!text) return []

  const out: ScopeMatcher[] = []
  // `@` entra como carácter de identificador porque un capture de tree-sitter
  // se escribe `@variable.parameter` y queremos que el MISMO selector funcione
  // para las dos fuentes (la unificación es el punto de `legend.ts`).
  const isIdentifierChar = (ch: string): boolean => /[a-zA-Z0-9_.\-*@]/.test(ch)

  let i = 0
  const skipSpaces = (): void => {
    while (i < text.length && text.charCodeAt(i) === 32) i++
  }

  const parseOperand = (): ScopeMatcher | null => {
    skipSpaces()
    if (i >= text.length) return null

    // Negación: `-expr` (la expresión se evalúa y su match DESCARTA).
    if (text[i] === '-') {
      i++
      const inner = parseOperand()
      if (!inner) return null
      return { ...inner, negated: !inner.negated }
    }

    // Agrupación: `(expr)`.
    if (text[i] === '(') {
      i++
      const inner = parseConjunction()
      skipSpaces()
      if (i < text.length && text[i] === ')') i++
      return inner
    }

    // Prioridad explícita: `R:` / `L:` (pegada al identificador).
    let priority: -1 | 0 | 1 = 0
    if ((text[i] === 'R' || text[i] === 'L') && text[i + 1] === ':') {
      priority = text[i] === 'R' ? 1 : -1
      i += 2
      skipSpaces()
    }

    // Identificadores consecutivos = conjunción (uno solo para `R:a b`).
    const identifiers: string[] = []
    while (i < text.length) {
      const start = i
      while (i < text.length && isIdentifierChar(text[i])) i++
      if (i === start) break
      identifiers.push(text.slice(start, i))
      const save = i
      skipSpaces()
      // Un identificador nuevo sólo si sigue un identificador (no `,` `)` ni fin).
      if (i >= text.length || !isIdentifierChar(text[i])) {
        i = save
        break
      }
    }
    return identifiers.length > 0 ? { identifiers, priority, negated: false } : null
  }

  const parseConjunction = (): ScopeMatcher | null => {
    const operands: ScopeMatcher[] = []
    for (;;) {
      const operand = parseOperand()
      if (!operand) break
      operands.push(operand)
      skipSpaces()
      if (i < text.length && isIdentifierChar(text[i])) continue
      break
    }
    if (operands.length === 0) return null
    if (operands.length === 1) return operands[0]
    // Conjunción: todos los identificadores juntos, prioridad del primero.
    return {
      identifiers: operands.flatMap((o) => o.identifiers),
      priority: operands[0].priority,
      negated: operands[0].negated
    }
  }

  for (;;) {
    const matcher = parseConjunction()
    if (matcher) out.push(matcher)
    skipSpaces()
    if (i < text.length && text[i] === ',') {
      i++
      continue
    }
    break
  }
  return out
}

/**
 * Score de un selector completo contra un scope stack (el máximo de sus
 * alternativas). -1 = ninguna alternativa matchea.
 */
export function matchScopeSelector(selector: string, scopes: ScopeStack, matchers?: ScopeMatcher[]): number {
  const parsed = matchers ?? parseScopeSelector(selector)
  let max = NO_MATCH
  for (const matcher of parsed) {
    if (matcher.negated) continue
    const score = matchNames(matcher.identifiers, scopes)
    if (score > max) max = score
  }
  return max
}

/** Una regla de estilo: un selector y su valor (color, tokenType, lo que sea). */
export interface ScopeRule<T> {
  selector: string
  value: T
}

/** La regla ganadora y con qué score. */
export interface ResolvedStyle<T> {
  value: T
  score: number
  /** Índice de la regla en la lista original (para desempates y depuración). */
  index: number
}

/**
 * Resuelve el estilo de un token: gana el score más alto; a igual score gana
 * la regla declarada DESPUÉS (como VS Code: el orden del JSON decide), y la
 * prioridad explícita `R:`/`L:` se aplica sobre eso.
 */
export function resolveScopeStyle<T>(rules: ScopeRule<T>[], scopes: ScopeStack): ResolvedStyle<T> | null {
  let best: ResolvedStyle<T> | null = null
  let bestPriority = 0

  for (let index = 0; index < rules.length; index++) {
    const rule = rules[index]
    const matchers = parseScopeSelector(rule.selector)
    if (matchers.length === 0) continue
    const score = matchScopeSelector(rule.selector, scopes, matchers)
    if (score === NO_MATCH) continue

    const priority = matchers.reduce<number>((acc, m) => (m.negated ? acc : Math.max(acc, m.priority)), 0)
    if (best === null || score > best.score || (score === best.score && priority >= bestPriority)) {
      best = { value: rule.value, score, index }
      bestPriority = priority
    }
  }
  return best
}

// ── Tipo estándar de token ─────────────────────────────────────────────────

/** Los 4 tipos estándar de VS Code (`StandardTokenType`). */
export const StandardTokenType = {
  Other: 0,
  Comment: 1,
  String: 2,
  RegEx: 3
} as const

export type StandardTokenType = (typeof StandardTokenType)[keyof typeof StandardTokenType]

/**
 * Scope/capture → tipo estándar. Es la misma regex de VS Code
 * (`toStandardTokenType`), y es lo que el editor usa para cosas que no son
 * color: brackets balanceados, spell check, plegado automático, "estoy dentro
 * de un comentario".
 *
 * Funciona igual para las tres fuentes: `comment.line.js` (TextMate),
 * `@comment` (tree-sitter) y el legend del LSP.
 */
export function toStandardTokenType(scope: string): StandardTokenType {
  const match = /\b(comment|string|regex|regexp)\b/.exec(scope)
  if (!match) return StandardTokenType.Other
  switch (match[1]) {
    case 'comment':
      return StandardTokenType.Comment
    case 'string':
      return StandardTokenType.String
    default:
      return StandardTokenType.RegEx
  }
}

/** Fuentes de color, de menor a mayor prioridad (gana la última que declara). */
export const SYNTAX_SOURCES = ['treeSitter', 'treeSitterDynamic', 'textMate', 'semanticTokens'] as const

export type SyntaxSource = (typeof SYNTAX_SOURCES)[number]

/** Cada fuente declara con qué pisa lo anterior. */
export const SOURCE_PRIORITY: Record<SyntaxSource, number> = {
  treeSitter: 0,
  treeSitterDynamic: 1,
  textMate: 1,
  semanticTokens: 2
}

/**
 * Elige, por rango, qué fuente gana. Las de mayor prioridad pisan; a igual
 * prioridad gana la que llegó después (el orden de registro es el orden del
 * usuario: una extensión instalada después puede corregir a la anterior).
 */
export function pickWinningSource(sources: SyntaxSource[]): SyntaxSource | null {
  let winner: SyntaxSource | null = null
  let bestPriority = -Infinity
  for (const source of sources) {
    const priority = SOURCE_PRIORITY[source]
    if (priority >= bestPriority) {
      winner = source
      bestPriority = priority
    }
  }
  return winner
}
