import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'opencode',
  name: 'OpenCode Zen',
  description: 'OpenCode Zen — LLM provider.',
  baseUrl: 'https://opencode.ai/zen/v1',
  apiKeyUrl: '',
  defaultModel: 'ring-2.6-1t-free'
}

export default config
