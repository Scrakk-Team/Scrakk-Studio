import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'zeldoc',
  name: 'Zeldoc',
  description: 'Zeldoc — LLM provider.',
  baseUrl: 'https://api.zeldoc.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'z-code'
}

export default config
