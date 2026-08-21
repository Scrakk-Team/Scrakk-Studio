import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'zenmux',
  name: 'ZenMux',
  description: 'ZenMux — LLM provider.',
  baseUrl: 'https://zenmux.ai/api/v1',
  apiKeyUrl: '',
  defaultModel: 'inclusionai/ling-1t'
}

export default config
