import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'deepseek',
  name: 'DeepSeek',
  description: 'DeepSeek — LLM provider.',
  baseUrl: 'https://api.deepseek.com',
  apiKeyUrl: '',
  defaultModel: 'deepseek-v4-flash'
}

export default config
