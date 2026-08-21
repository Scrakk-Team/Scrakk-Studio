import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'dinference',
  name: 'DInference',
  description: 'DInference — LLM provider.',
  baseUrl: 'https://api.dinference.com/v1',
  apiKeyUrl: '',
  defaultModel: 'minimax-m2.5'
}

export default config
