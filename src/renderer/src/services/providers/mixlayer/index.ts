import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'mixlayer',
  name: 'Mixlayer',
  description: 'Mixlayer — LLM provider.',
  baseUrl: 'https://models.mixlayer.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'qwen/qwen3.5-27b'
}

export default config
