import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'venice',
  name: 'Venice AI',
  description: 'Venice AI — LLM provider.',
  baseUrl: 'https://api.venice.com/v1',
  apiKeyUrl: '',
  defaultModel: 'z-ai-glm-5-turbo'
}

export default config
