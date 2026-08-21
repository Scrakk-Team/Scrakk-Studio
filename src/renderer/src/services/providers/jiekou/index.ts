import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'jiekou',
  name: 'Jiekou.AI',
  description: 'Jiekou.AI — LLM provider.',
  baseUrl: 'https://api.jiekou.ai/openai',
  apiKeyUrl: '',
  defaultModel: 'o3'
}

export default config
