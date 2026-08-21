import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'minimax-cn',
  name: 'MiniMax (minimaxi.com)',
  description: 'MiniMax (minimaxi.com) — LLM provider.',
  baseUrl: 'https://api.minimaxi.com/anthropic/v1',
  apiKeyUrl: '',
  defaultModel: 'MiniMax-M2.1'
}

export default config
