import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'mistral',
  name: 'Mistral',
  description: 'Mistral — LLM provider.',
  baseUrl: 'https://api.mistral.com/v1',
  apiKeyUrl: '',
  defaultModel: 'codestral-latest'
}

export default config
