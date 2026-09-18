/**
 * `tokenColors` del tema activo → reglas del resolutor de scopes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ HACE FALTA ESTO
 *
 * El tema ya define qué color va en cada SLOT del motor (15 campos: keyword,
 * string, comment…): `applyInnertaTheme` lee `tokenColors` y llama a
 * `SetInnertaTokenColor`. Pero un scope de una gramática (`comment.line.gleam`)
 * tiene que RESOLVERSE a un slot, y esa decisión la tomaba sólo la tabla por
 * defecto.
 *
 * Consecuencia sin este archivo: si el tema dice que `comment.line` es verde y
 * `comment.block` es gris, la gramática de la extensión pintaba los dos igual,
 * porque la tabla por defecto manda todo `comment*` al mismo slot.
 *
 * Con este archivo, el selector REAL del tema (`comment.line`) entra al
 * resolutor con su score: gana sobre la regla genérica por ser más específico,
 * y a igual selector gana el tema (las reglas adicionales van al final, y el
 * empate se rompe por orden). El VALOR sigue siendo un slot — el techo de 15
 * campos del motor es real y no se finge — pero ahora el slot lo elige el tema.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LO QUE NO HACE (todavía)
 *
 * Los `fontStyle` del tema (italic/bold por scope) no viajan: `LineStyle` del
 * motor es sólo color. El dato no se descarta en el camino de las extensiones
 * (el paint list ya lo modela en `spans.ts`), pero el motor no lo pinta.
 */

import { resolveTokenSlots, readActiveThemeTokens, scopeToSlot, type ThemeToken } from './innertaTheme'
import type { ScopeRule } from '@shared/syntax'

/**
 * Reglas `selector → slot` del tema activo.
 *
 * Un `tokenColor` puede traer varios scopes (VS Code: `["comment", "punctuation.definition.comment"]`);
 * cada uno entra como su propia regla porque el resolutor matchea contra el
 * stack de scopes del token, no contra un scope suelto.
 */
export function themeTokenRules(tokens: ThemeToken[] | undefined): ScopeRule<number>[] {
  const rules: ScopeRule<number>[] = []
  for (const token of tokens ?? []) {
    if (!token || typeof token.foreground !== 'string') continue
    const scopes = Array.isArray(token.scope) ? token.scope : [token.scope]
    for (const scope of scopes) {
      if (!scope) continue
      // El slot lo decide la MISMA función que decide qué campo del motor
      // recibe este color: si las dos se separaran, la regla pediría un color
      // y el motor tendría otro.
      const slot = scopeToSlot(scope)
      if (slot === null) continue
      rules.push({ selector: scope, value: slot })
    }
  }
  return rules
}

/** Las reglas del tema que está activo AHORA (lee el storage del theme-applier). */
export function currentThemeTokenRules(): ScopeRule<number>[] {
  return themeTokenRules(readActiveThemeTokens())
}

/** Cuántos colores del tema llegaron al motor (diagnóstico/UI). */
export function themeTokenSlotCount(): number {
  return resolveTokenSlots(readActiveThemeTokens()).length
}

/**
 * slot → color (0xRRGGBBAA) del tema activo.
 *
 * Para la UI de inspección: un slot que NO está en este mapa significa "el
 * motor pinta ese campo con su valor por defecto", que es un dato distinto de
 * "el tema lo pintó con este color". Ojo: `resolveTokenSlots` es la misma tabla
 * que alimenta `SetInnertaTokenColor`, así que la UI no puede mentir sobre lo
 * que ve el canvas.
 */
export function currentThemeSlotColors(): Map<number, number> {
  return new Map(resolveTokenSlots(readActiveThemeTokens()))
}
