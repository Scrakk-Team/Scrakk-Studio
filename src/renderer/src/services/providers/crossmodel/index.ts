import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'crossmodel',
  name: 'CrossModel',
  description: 'CrossModel — LLM provider.',
  baseUrl: 'https://api.crossmodel.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'z-ai/glm-4.7'
}

export default config
