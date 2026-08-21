import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'anyapi',
  name: 'AnyAPI',
  description: 'AnyAPI — LLM provider.',
  baseUrl: 'https://api.anyapi.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'xai/grok-4.3'
}

export default config
