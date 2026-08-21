import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'kilo',
  name: 'Kilo Gateway',
  description: 'Kilo Gateway — LLM provider.',
  baseUrl: 'https://api.kilo.ai/api/gateway',
  apiKeyUrl: '',
  defaultModel: 'inclusionai/ling-2.6-1t'
}

export default config
