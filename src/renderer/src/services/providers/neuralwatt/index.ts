import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'neuralwatt',
  name: 'Neuralwatt',
  description: 'Neuralwatt — LLM provider.',
  baseUrl: 'https://api.neuralwatt.com/v1',
  apiKeyUrl: '',
  defaultModel: 'kimi-k2.5-fast'
}

export default config
