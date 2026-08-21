import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'poolside',
  name: 'Poolside',
  description: 'Poolside — LLM provider.',
  baseUrl: 'https://inference.poolside.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'poolside/laguna-xs.2'
}

export default config
