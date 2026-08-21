/**
 * Config de un proveedor de LLM.
 *
 * Formato del contrato: cualquier proveedor que hable **OpenAI-compatible**
 * (`POST {baseUrl}/chat/completions` con `Authorization: Bearer <key>`)
 * se registra con su propio `index.ts` dentro de `providers/<id>/` y la app
 * lo detecta solo (registry.ts). Así se suman decenas sin tocar la UI.
 */
export interface ProviderConfig {
  /** Id único del proveedor (debe coincidir con la carpeta `providers/<id>/`). */
  id: string
  /** Nombre visible en la UI. */
  name: string
  description: string
  /** Base de la API OpenAI-compatible — SIN el sufijo '/chat/completions'. */
  baseUrl: string
  /** URL donde el usuario consigue su API key. */
  apiKeyUrl: string
  /**
   * Modelo sugerido (prefill del input). El endpoint OpenAI-compatible
   * espera el id del modelo como string en el body: el USUARIO escribe el
   * id exacto a mano (ej. 'gpt-4o', 'openrouter/auto', 'claude-3-5-sonnet') —
   * no hay catálogo hardcodeado, el id lo define cada proveedor.
   */
  defaultModel: string
  /** Headers extra que pida el proveedor (ej. HTTP-Referer / X-Title). */
  headers?: Record<string, string>
}
