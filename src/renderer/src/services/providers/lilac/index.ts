import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'lilac',
  name: 'Lilac',
  description: 'Lilac — LLM provider.',
  baseUrl: 'https://api.getlilac.com/v1',
  apiKeyUrl: '',
  defaultModel: 'moonshotai/kimi-k2.6'
}

export default config
