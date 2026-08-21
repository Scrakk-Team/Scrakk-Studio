import type { InnertaModule } from './InnertaEngine'

/**
 * Theme de Scrakk Studio → Innerta (WASM).
 *
 * Scrakk ya aplica el theme activo como CSS vars en :root (theme-applier) y
 * persiste los tokenColors en localStorage ('scrakk-active-theme-tokens').
 * Este puente lee eso (sin acoplarse al ExtensionService) y lo empuja a los
 * exports C de Innerta (SetInnerta*Color / SetInnertaTokenColor).
 */

const TOKEN_STORAGE_KEY = 'scrakk-active-theme-tokens'

/** TokenColor tal como lo guarda theme-applier (VS Code-style). */
export interface ThemeToken {
  scope: string | string[]
  foreground?: string
  fontStyle?: string
}

/** #rrggbb | #rrggbbaa | #rgb | rgb()/rgba() → 0xRRGGBBFF (innerta ColorFromRGBA). */
export function colorToRgba(color: string | undefined): number {
  if (!color) return 0x000000ff
  const s = color.trim().toLowerCase()
  if (s.startsWith('#')) {
    const h = s.slice(1)
    if (/^[0-9a-f]{6}$/.test(h)) return parseInt(h + 'ff', 16)
    if (/^[0-9a-f]{8}$/.test(h)) return parseInt(h, 16)
    if (/^[0-9a-f]{3}$/.test(h)) {
      const e = h
        .split('')
        .map((c) => c + c)
        .join('')
      return parseInt(e + 'ff', 16)
    }
  }
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(s)
  if (m) {
    const r = Math.round(Number(m[1]))
    const g = Math.round(Number(m[2]))
    const b = Math.round(Number(m[3]))
    return ((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | 0xff
  }
  return 0xffffffff
}

function cssVar(root: CSSStyleDeclaration, name: string): string | undefined {
  const v = root.getPropertyValue(name).trim()
  return v.length > 0 ? v : undefined
}

/**
 * Mapea un scope TextMate (VS Code) al slot del TokenType de Innerta.
 * Slots (idénticos al switch de SetInnertaTokenColor): 0 keyword, 1 string,
 * 2 constant(number), 3 comment, 4 function, 6 type, 7 operator→keyword,
 * 9 property, 10 class→type, 11 constant, 12 parameter, 13 tag, 14 attribute.
 */
export function scopeToSlot(scope: string): number | null {
  const rules: Array<[string[], number]> = [
    [['comment'], 3],
    [['string'], 1],
    [['entity.name.function', 'meta.function', 'support.function', 'function.name'], 4],
    [['entity.name.type.class', 'entity.name.class', 'meta.class', 'type.name'], 10],
    [
      ['support.type.property-name', 'variable.other.property', 'variable.other.object.property', 'property'],
      9
    ],
    [['variable.parameter', 'parameter'], 12],
    [['constant.numeric', 'number'], 2],
    [['constant'], 11],
    [['storage.type', 'support.type', 'entity.name.type', 'keyword.type', 'type.builtin'], 6],
    [['keyword'], 0],
    [['operator'], 7],
    [['entity.name.tag', 'tag'], 13],
    [['entity.other.attribute-name', 'attribute'], 14]
  ]
  const s = scope.toLowerCase()
  for (const [patterns, slot] of rules) {
    for (const p of patterns) {
      if (s.includes(p)) return slot
    }
  }
  return null
}

/** TokenColors → [slot, color] (el orden del JSON define precedencia: gana el último). */
export function resolveTokenSlots(tokens: ThemeToken[] | undefined): Array<[number, number]> {
  if (!tokens) return []
  const out = new Map<number, number>()
  for (const token of tokens) {
    if (!token || typeof token.foreground !== 'string') continue
    const scope = Array.isArray(token.scope) ? token.scope[token.scope.length - 1] : token.scope
    if (!scope) continue
    const slot = scopeToSlot(scope)
    if (slot === null) continue
    out.set(slot, colorToRgba(token.foreground))
  }
  return Array.from(out.entries())
}

function readStoredTokens(): ThemeToken[] | undefined {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!raw) return undefined
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ThemeToken[]) : undefined
  } catch {
    return undefined
  }
}

/**
 * Aplica el theme activo de Scrakk al módulo Innerta ya listo.
 * Se llama al conectar el engine y ante cada evento 'theme-changed'.
 *
 * Prioridad de vars: primero el sistema core de BorealChat (--color-*,
 * aplicado por ThemeProvider via data-theme), luego el legacy de Scrakk
 * (--tree-color/--bg-color/… aplicado por theme-applier si está activo).
 */
export function applyInnertaTheme(module: InnertaModule): void {
  const root = getComputedStyle(document.documentElement)

  // Prioridad: --editor-bg (temas SEF, surface del editor) > --color-bg
  // (chrome de la app). Un theme con editorBg pinta el buffer correcto.
  const editorBg =
    cssVar(root, '--editor-bg') ??
    cssVar(root, '--color-editor-bg') ??
    cssVar(root, '--color-bg') ??
    cssVar(root, '--bg-color') ??
    '#000000'
  const accent =
    cssVar(root, '--color-accent') ??
    cssVar(root, '--tree-color') ??
    cssVar(root, '--accent-color') ??
    '#fb923c'
  const text =
    cssVar(root, '--color-text') ??
    cssVar(root, '--editor-fg') ??
    cssVar(root, '--text-primary') ??
    cssVar(root, '--text-color') ??
    '#ffffff'
  const border =
    cssVar(root, '--color-border') ?? cssVar(root, '--border-color') ?? '#262626'
  const muted =
    cssVar(root, '--color-text-muted') ??
    cssVar(root, '--text-muted') ??
    cssVar(root, '--text-secondary') ??
    '#7a7a7a'
  const indentGuide =
    cssVar(root, '--indent-guide-color') ??
    cssVar(root, '--color-border') ??
    '#262626'

  module.setBgColor(colorToRgba(editorBg))
  module.setAccentColor(colorToRgba(accent))
  module.setTextColor(colorToRgba(text))
  module.setBorderColor(colorToRgba(border))
  module.setTextMutedColor(colorToRgba(muted))
  module.setIndentGuideColor(colorToRgba(indentGuide))

  for (const [slot, color] of resolveTokenSlots(readStoredTokens())) {
    module.setTokenColor(slot, color)
  }
}

/**
 * Se suscribe a cambios de theme:
 * - evento 'theme-changed' (legacy theme-applier / dynamic-theme).
 * - MutationObserver sobre data-theme del <html> (ThemeProvider core).
 * Devuelve unsubscribe.
 */
export function listenThemeChanges(listener: () => void): () => void {
  const handler = (): void => {
    try {
      listener()
    } catch {
      /* no romper el dispatch */
    }
  }
  window.addEventListener('theme-changed', handler)
  const observer = new MutationObserver((records) => {
    if (records.some((r) => r.attributeName === 'data-theme')) handler()
  })
  observer.observe(document.documentElement, { attributes: true })
  return () => {
    window.removeEventListener('theme-changed', handler)
    observer.disconnect()
  }
}