import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'xiaomi',
  name: 'Xiaomi',
  description: 'Xiaomi — LLM provider.',
  baseUrl: 'https://api.xiaomimimo.com/v1',
  apiKeyUrl: '',
  defaultModel: 'mimo-v2.5-pro-ultraspeed'
}

export default config
