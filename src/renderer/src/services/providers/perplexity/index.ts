import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'perplexity',
  name: 'Perplexity',
  description: 'Perplexity — LLM provider.',
  baseUrl: 'https://api.perplexity.com/v1',
  apiKeyUrl: '',
  defaultModel: 'sonar-reasoning-pro'
}

export default config
