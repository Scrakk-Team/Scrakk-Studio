import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'cortecs',
  name: 'Cortecs',
  description: 'Cortecs — LLM provider.',
  baseUrl: 'https://api.cortecs.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'deepseek-r1-0528'
}

export default config
