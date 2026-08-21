import type { ProviderConfig } from '../types'

/**
 * Together AI — infraestructura de inferencia para modelos open-source.
 *
 * Endpoint OpenAI-compatible: `POST https://api.together.xyz/v1/chat/completions`
 * con `Authorization: Bearer <key>`.
 * Keys: https://api.together.xyz/settings/api-keys
 */
export const togetherConfig: ProviderConfig = {
  id: 'together',
  name: 'Together AI',
  description: 'Infraestructura de inferencia para modelos open-source: Llama, Mixtral, Qwen.',
  baseUrl: 'https://api.together.xyz/v1',
  apiKeyUrl: 'https://api.together.xyz/settings/api-keys',
  defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo'
}

export default togetherConfig
