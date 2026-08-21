import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'abacus',
  name: 'Abacus',
  description: 'Abacus — LLM provider.',
  baseUrl: 'https://routellm.abacus.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'o3'
}

export default config
