import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'merge-gateway',
  name: 'Merge Gateway',
  description: 'Merge Gateway — LLM provider.',
  baseUrl: 'https://api.merge-gateway.com/v1',
  apiKeyUrl: '',
  defaultModel: 'xai/grok-4.3'
}

export default config
