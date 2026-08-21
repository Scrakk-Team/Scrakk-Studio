import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'fireworks-ai',
  name: 'Fireworks AI',
  description: 'Fireworks AI — LLM provider.',
  baseUrl: 'https://api.fireworks.ai/inference/v1',
  apiKeyUrl: '',
  defaultModel: 'accounts/fireworks/routers/kimi-k2p6-turbo'
}

export default config
