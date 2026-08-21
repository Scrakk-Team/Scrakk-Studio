import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'anthropic',
  name: 'Anthropic',
  description: 'Anthropic — LLM provider.',
  baseUrl: 'https://api.anthropic.com/v1',
  apiKeyUrl: '',
  defaultModel: 'claude-opus-4-5'
}

export default config
