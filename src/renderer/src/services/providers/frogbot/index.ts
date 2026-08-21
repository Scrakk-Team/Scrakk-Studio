import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'frogbot',
  name: 'FrogBot',
  description: 'FrogBot — LLM provider.',
  baseUrl: 'https://app.frogbot.ai/api/v1',
  apiKeyUrl: '',
  defaultModel: 'minimax-m2-5'
}

export default config
