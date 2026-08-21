import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'nova',
  name: 'Nova',
  description: 'Nova — LLM provider.',
  baseUrl: 'https://api.nova.amazon.com/v1',
  apiKeyUrl: '',
  defaultModel: 'nova-2-pro-v1'
}

export default config
