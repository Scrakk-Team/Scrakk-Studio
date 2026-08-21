import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'inception',
  name: 'Inception',
  description: 'Inception — LLM provider.',
  baseUrl: 'https://api.inceptionlabs.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'mercury-edit-2'
}

export default config
