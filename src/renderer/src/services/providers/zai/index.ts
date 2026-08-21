import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'zai',
  name: 'Z.AI',
  description: 'Z.AI — LLM provider.',
  baseUrl: 'https://api.z.ai/api/paas/v4',
  apiKeyUrl: '',
  defaultModel: 'glm-4.7'
}

export default config
