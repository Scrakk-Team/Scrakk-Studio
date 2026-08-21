import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'routing-run',
  name: 'routing.run',
  description: 'routing.run — LLM provider.',
  baseUrl: 'https://api.routing.run/v1',
  apiKeyUrl: '',
  defaultModel: 'kimi-k2.6-nitro'
}

export default config
