import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'cohere',
  name: 'Cohere',
  description: 'Cohere — LLM provider.',
  baseUrl: 'https://api.cohere.com/v1',
  apiKeyUrl: '',
  defaultModel: 'c4ai-aya-expanse-32b'
}

export default config
