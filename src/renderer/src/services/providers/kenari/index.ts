import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'kenari',
  name: 'Kenari',
  description: 'Kenari — LLM provider.',
  baseUrl: 'https://kenari.id/v1',
  apiKeyUrl: '',
  defaultModel: 'deepseek-v4-flash'
}

export default config
