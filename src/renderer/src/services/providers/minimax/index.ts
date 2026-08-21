import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'minimax',
  name: 'MiniMax (minimax.io)',
  description: 'MiniMax (minimax.io) — LLM provider.',
  baseUrl: 'https://api.minimax.io/anthropic/v1',
  apiKeyUrl: '',
  defaultModel: 'MiniMax-M2.1'
}

export default config
