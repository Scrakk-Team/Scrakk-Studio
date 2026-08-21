import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'crof',
  name: 'CrofAI',
  description: 'CrofAI — LLM provider.',
  baseUrl: 'https://crof.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'deepseek-v4-flash'
}

export default config
