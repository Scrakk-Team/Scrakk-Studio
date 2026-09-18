/**
 * ProductIcons — tipos del sistema de iconos UI.
 *
 * Hermano de services/fileIcons, pero para iconos de INTERFAZ (activity bar,
 * tabs, botones, chevrons): lo que antes se importaba directo de
 * `@proicons/react` ahora se resuelve por ID a través de este registry.
 *
 * - IDs canónicos compatibles con codicons de VS Code (para que los temas
 *   de extensiones hagan override exacto: "folder", "files", "close"…).
 * - Tema builtin `scrakk`: componentes ProIcons (defaults, offline).
 * - Temas de extensión: glyphs de fuente (@font-face inyectada) + definiciones.
 * - Formato de asset: `iconDefinitions` id → {fontCharacter, fontId?} y
 *   `fonts` con data URIs embebidas (misma decisión que fileIcons).
 */

export type ProductIconFontFormat = 'woff' | 'woff2' | 'truetype' | 'opentype'

/** Fuente de un tema (bytes embebidos como data URI). */
export interface ProductIconFont {
  id: string
  /** font-family CSS generada por el traductor. */
  family: string
  dataUri: string
  format: ProductIconFontFormat
  weight?: string
  style?: string
}

/** Definición de UN icono: glyph dentro de una fuente del tema. */
export interface ProductIconDefinition {
  fontCharacter: string
  fontId?: string
}

/** Tema de iconos de producto (formato SEF `productIcons`). */
export interface ProductIconTheme {
  id: string
  name: string
  iconDefinitions: Record<string, ProductIconDefinition>
  fonts: ProductIconFont[]
}

export interface RegisteredProductIconTheme {
  id: string
  name: string
  extensionId: string
  isBuiltin: boolean
  theme: ProductIconTheme
}

/** Resultado de resolver un id. */
export type ResolvedProductIcon =
  | { kind: 'font'; char: string; family: string }
  | { kind: 'component'; componentId: string }
