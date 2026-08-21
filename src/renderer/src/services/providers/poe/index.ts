import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'poe',
  name: 'Poe',
  description: 'Poe — LLM provider.',
  baseUrl: 'https://api.poe.com/v1',
  apiKeyUrl: '',
  defaultModel: 'trytako/tako'
}

export default config
