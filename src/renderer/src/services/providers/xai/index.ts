import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'xai',
  name: 'xAI',
  description: 'xAI — LLM provider.',
  baseUrl: 'https://api.xai.com/v1',
  apiKeyUrl: '',
  defaultModel: 'grok-4.20-multi-agent-0309'
}

export default config
