import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'zai-coding-plan',
  name: 'Z.AI Coding Plan',
  description: 'Z.AI Coding Plan — LLM provider.',
  baseUrl: 'https://api.z.ai/api/coding/paas/v4',
  apiKeyUrl: '',
  defaultModel: 'glm-4.7'
}

export default config
