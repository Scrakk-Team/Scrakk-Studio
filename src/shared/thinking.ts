/**
 * Modos de pensamiento por modelo.
 *
 * Las IAs razonan distinto según la familia: OpenAI usa `reasoning_effort`,
 * Claude el `thinking` con budget, Gemini `thinkingConfig`, DeepSeek R1
 * razona siempre. Acá se DETECTA la familia según el id del modelo y se
 * traduce el modo elegido a los params que espera cada proveedor.
 */

export type ThinkingMode = 'auto' | 'off' | 'low' | 'medium' | 'high' | 'on'

export type ThinkingFamily = 'openai' | 'anthropic' | 'deepseek' | 'gemini' | 'none'

export const THINKING_MODE_LABELS: Record<ThinkingMode, string> = {
  auto: 'Automático (según el modelo)',
  off: 'Sin pensamiento',
  low: 'Razonamiento bajo',
  medium: 'Razonamiento medio',
  high: 'Razonamiento alto',
  on: 'Con pensamiento'
}

/** Detecta la familia de razonamiento según el id del modelo. */
export function detectThinkingFamily(modelId: string): ThinkingFamily {
  const id = modelId.toLowerCase()
  // DeepSeek solo razona en reasoner/r1 (deepseek-chat no).
  if (id.includes('deepseek') && (id.includes('reasoner') || /(^|[\/_-])r1/.test(id))) {
    return 'deepseek'
  }
  // OpenAI: o1/o3/o4, gpt-5 y variantes con "reasoning".
  if (/(^|\/)(o[134](|-mini|-pro)?|gpt-5)/.test(id) || id.includes('reasoning')) {
    return 'openai'
  }
  if (id.includes('claude')) return 'anthropic'
  if (id.includes('gemini')) return 'gemini'
  return 'none'
}

/** Opciones de modo de pensamiento disponibles para un modelo. */
export function thinkingOptionsFor(modelId: string): ThinkingMode[] {
  switch (detectThinkingFamily(modelId)) {
    case 'openai':
      return ['auto', 'off', 'low', 'medium', 'high']
    case 'anthropic':
    case 'gemini':
      return ['auto', 'off', 'on']
    case 'deepseek':
      // Razona siempre: no hay nada que elegir.
      return ['auto']
    case 'none':
      return ['auto']
  }
}

/**
 * Traduce el modo elegido a los params extra del body del proveedor.
 * undefined = no tocar el body (el proveedor usa su default).
 */
export function buildThinkingBody(
  modelId: string,
  mode: ThinkingMode
): Record<string, unknown> | undefined {
  if (mode === 'auto') return undefined
  switch (detectThinkingFamily(modelId)) {
    case 'openai':
      if (mode === 'low' || mode === 'medium' || mode === 'high') {
        return { reasoning_effort: mode }
      }
      return undefined
    case 'anthropic':
      return mode === 'on'
        ? { thinking: { type: 'enabled', budget_tokens: 4096 } }
        : { thinking: { type: 'disabled' } }
    case 'gemini':
      return mode === 'on' ? { thinking: { type: 'enabled' } } : { thinking: { type: 'disabled' } }
    default:
      return undefined
  }
}
