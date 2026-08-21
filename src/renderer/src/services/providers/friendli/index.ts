import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'friendli',
  name: 'Friendli',
  description: 'Friendli — LLM provider.',
  baseUrl: 'https://api.friendli.ai/serverless/v1',
  apiKeyUrl: '',
  defaultModel: 'google/gemma-4-31B-it'
}

export default config
