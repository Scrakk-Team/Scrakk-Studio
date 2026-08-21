import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'moark',
  name: 'Moark',
  description: 'Moark — LLM provider.',
  baseUrl: 'https://moark.com/v1',
  apiKeyUrl: '',
  defaultModel: 'MiniMax-M2.1'
}

export default config
