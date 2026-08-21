import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'model-oracle-ai',
  name: 'Model Oracle AI',
  description: 'Model Oracle AI — LLM provider.',
  baseUrl: 'https://api.modeloracle.com/api/v1',
  apiKeyUrl: '',
  defaultModel: 'gpt-5'
}

export default config
