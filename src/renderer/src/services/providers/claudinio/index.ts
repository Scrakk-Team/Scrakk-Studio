import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'claudinio',
  name: 'Claudinio',
  description: 'Claudinio — LLM provider.',
  baseUrl: 'https://api.claudin.io/v1',
  apiKeyUrl: '',
  defaultModel: 'claudinio'
}

export default config
