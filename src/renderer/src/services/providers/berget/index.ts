import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'berget',
  name: 'Berget.AI',
  description: 'Berget.AI — LLM provider.',
  baseUrl: 'https://api.berget.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'meta-llama/Llama-3.3-70B-Instruct'
}

export default config
