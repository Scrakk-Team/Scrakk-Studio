import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'inferx',
  name: 'InferX',
  description: 'InferX — LLM provider.',
  baseUrl: 'https://model.inferx.net/v1',
  apiKeyUrl: '',
  defaultModel: 'google/gemma-4-31b-it-fp8'
}

export default config
