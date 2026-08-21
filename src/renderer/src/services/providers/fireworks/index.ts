import type { ProviderConfig } from '../types'

/**
 * Fireworks AI — inferencia optimizada para modelos open-source.
 *
 * Endpoint OpenAI-compatible: `POST https://api.fireworks.ai/inference/v1/chat/completions`
 * con `Authorization: Bearer <key>`.
 * Keys: https://fireworks.ai/account/api-keys
 */
export const fireworksConfig: ProviderConfig = {
  id: 'fireworks',
  name: 'Fireworks AI',
  description: 'Inferencia optimizada para modelos open-source: Llama, Mixtral, Qwen.',
  baseUrl: 'https://api.fireworks.ai/inference/v1',
  apiKeyUrl: 'https://fireworks.ai/account/api-keys',
  defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct'
}

export default fireworksConfig
