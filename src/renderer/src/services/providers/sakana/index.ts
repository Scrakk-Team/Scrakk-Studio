import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'sakana',
  name: 'Sakana AI',
  description: 'Sakana AI — LLM provider.',
  baseUrl: 'https://api.sakana.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'fugu-ultra-20260615'
}

export default config
