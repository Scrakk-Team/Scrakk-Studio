import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'scaleway',
  name: 'Scaleway',
  description: 'Scaleway — LLM provider.',
  baseUrl: 'https://api.scaleway.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'qwen3-235b-a22b-instruct-2507'
}

export default config
