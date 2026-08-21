import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'vultr',
  name: 'Vultr',
  description: 'Vultr — LLM provider.',
  baseUrl: 'https://api.vultrinference.com/v1',
  apiKeyUrl: '',
  defaultModel: 'moonshotai/Kimi-K2.6'
}

export default config
