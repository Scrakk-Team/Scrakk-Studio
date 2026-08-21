import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'gmicloud',
  name: 'GMI Cloud',
  description: 'GMI Cloud — LLM provider.',
  baseUrl: 'https://api.gmi-serving.com/v1',
  apiKeyUrl: '',
  defaultModel: 'moonshotai/Kimi-K2.6'
}

export default config
