/**
 * Contrato de un TIPO de extensión (contribution point).
 *
 * Cada tipo vive en su propia carpeta bajo `types/<kind>/` con la estructura
 * fija de 4 files (+ index):
 *  - `api.ts`    — el handler que esta capa entiende (este contrato).
 *  - `logic.ts`  — funcionalidad del tipo (aplicar, listar, resolver…).
 *  - `schema.ts` — validación/normalización declarativa de su slice del
 *                  manifest y de los archivos que aporta.
 *  - `store.ts`  — estado persistido del tipo (preferencias del usuario).
 *
 * La capa extensions (`loader/resolve.ts`) NO conoce tipos específicos:
 * itera `manifest.contributes`, pregunta al ExtensionTypeRegistry por el
 * handler de cada key y delega. Agregar un tipo nuevo = crear carpeta +
 * registrarlo en `types/index.ts`.
 */

import type { ComponentResolver } from '../manifest'
import type { ExtensionApi } from '../extensionApi'

/** Contexto de parseo del slice del manifest. */
export interface ParseContext {
  /**
   * True si el paquete exporta un módulo en esa ruta (solo relevante para
   * `.sef` instaladas; las builtin resuelven con globs → siempre true).
   */
  hasModule: (path: string) => boolean
}

/** Contexto de registro de una contribución. */
export interface ExtensionTypeContext {
  /** Id de la extensión dueña (para desinstalar limpio). */
  extensionId: string
  /** True = compilada dentro del bundle de la app. */
  isBuiltin: boolean
  /**
   * Raíz del paquete instalado (vacío/ausente para builtin).
   *
   * Existe para los tipos que necesitan una ruta ABSOLUTA a un archivo del
   * paquete: un `lspServers` que trae su propio server (`./server/out/x.js`)
   * no puede resolverse contra el PATH del sistema — el binario está adentro
   * de la extensión.
   */
  extensionPath?: string
  /** Resolvedor de componentes/íconos del paquete (kinds visuales). */
  resolver: ComponentResolver
  /**
   * Lee un archivo del paquete (temas, grammars, data…). Devuelve null si
   * no existe o si el kind es builtin sin acceso al archivo.
   */
  readFile: (path: string) => Promise<string | null>
  /** API compuesta de la plataforma (fs bridge, lsp, …). */
  api: ExtensionApi
}

export interface ExtensionTypeHandler<TContribution = unknown, TRegistered = unknown> {
  /** Key exacta dentro de `manifest.contributes` (ej. 'themes'). */
  kind: string
  /**
   * Valida y normaliza el slice crudo del manifest. Devuelve las
   * contribuciones válidas (las rotas se descartan con warning) o null.
   */
  parse(raw: unknown, ctx: ParseContext): TContribution[] | null
  /**
   * Registra una contribución ya validada. Puede ser async (leer archivos
   * del paquete vía ctx.readFile).
   */
  register(contribution: TContribution, ctx: ExtensionTypeContext): Promise<TRegistered | null> | TRegistered | null
  /** Desregistra las contribuciones owned de una extensión. */
  unregister(owned: TRegistered[]): void
}

/** Versión type-erased para guardar en el registry. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyExtensionTypeHandler = ExtensionTypeHandler<any, any>
