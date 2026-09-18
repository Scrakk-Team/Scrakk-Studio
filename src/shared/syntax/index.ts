/**
 * Núcleo de sintaxis compartido: el resolutor que unifica las fuentes de color.
 *
 * - `scopes.ts`  — selectores de scope (semántica de VS Code) y prioridad entre
 *   fuentes. Es el módulo del que dependen las cuatro fuentes de resaltado.
 * - `queries.ts` — queries de tree-sitter: se cargan TODAS y se categorizan.
 * - `spans.ts`   — el paint list: spans por fuente, merge por prioridad con
 *   herencia de aspectos, y el encoding u32 de VS Code.
 * - `legend.ts`  — leyenda de tokens (LSP ↔ slots del tema), tabla scope →
 *   slot por defecto y el payload delta que come el motor.
 *
 * Nada de acá conoce al editor ni a las extensiones: son funciones puras.
 */

export * from './scopes'
export * from './queries'
export * from './spans'
export * from './legend'
