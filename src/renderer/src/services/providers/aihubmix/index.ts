import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'aihubmix',
  name: 'AIHubMix',
  description: 'AIHubMix — LLM provider.',
  baseUrl: 'https://api.aihubmix.com/v1',
  apiKeyUrl: '',
  defaultModel: 'coding-minimax-m2.7'
}

export default config
