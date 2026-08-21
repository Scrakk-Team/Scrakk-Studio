import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'sarvam',
  name: 'Sarvam AI',
  description: 'Sarvam AI — LLM provider.',
  baseUrl: 'https://api.sarvam.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'sarvam-105b'
}

export default config
