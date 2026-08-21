import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'opencode-go',
  name: 'OpenCode Go',
  description: 'OpenCode Go — LLM provider.',
  baseUrl: 'https://opencode.ai/zen/go/v1',
  apiKeyUrl: '',
  defaultModel: 'deepseek-v4-flash'
}

export default config
