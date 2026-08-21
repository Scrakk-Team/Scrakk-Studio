import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'ambient',
  name: 'Ambient',
  description: 'Ambient — LLM provider.',
  baseUrl: 'https://api.ambient.xyz/v1',
  apiKeyUrl: '',
  defaultModel: 'moonshotai/kimi-k2.7-code'
}

export default config
