import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'inference',
  name: 'Inference',
  description: 'Inference — LLM provider.',
  baseUrl: 'https://inference.net/v1',
  apiKeyUrl: '',
  defaultModel: 'mistral/mistral-nemo-12b-instruct'
}

export default config
