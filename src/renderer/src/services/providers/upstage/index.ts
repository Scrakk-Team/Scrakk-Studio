import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'upstage',
  name: 'Upstage',
  description: 'Upstage — LLM provider.',
  baseUrl: 'https://api.upstage.ai/v1/solar',
  apiKeyUrl: '',
  defaultModel: 'solar-pro2'
}

export default config
