import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'pioneer',
  name: 'Pioneer',
  description: 'Pioneer — LLM provider.',
  baseUrl: 'https://api.pioneer.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'gemini-3-flash'
}

export default config
