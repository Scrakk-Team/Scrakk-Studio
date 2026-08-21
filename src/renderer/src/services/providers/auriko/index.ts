import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'auriko',
  name: 'Auriko',
  description: 'Auriko — LLM provider.',
  baseUrl: 'https://api.auriko.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'deepseek-v4-flash'
}

export default config
