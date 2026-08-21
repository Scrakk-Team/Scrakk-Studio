import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'evroc',
  name: 'evroc',
  description: 'evroc — LLM provider.',
  baseUrl: 'https://models.think.evroc.com/v1',
  apiKeyUrl: '',
  defaultModel: 'moonshotai/Kimi-K2.6'
}

export default config
