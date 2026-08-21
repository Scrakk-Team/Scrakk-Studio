import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'nebius',
  name: 'Nebius Token Factory',
  description: 'Nebius Token Factory — LLM provider.',
  baseUrl: 'https://api.tokenfactory.nebius.com/v1',
  apiKeyUrl: '',
  defaultModel: 'meta-llama/Llama-3.3-70B-Instruct'
}

export default config
