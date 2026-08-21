import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'regolo-ai',
  name: 'Regolo AI',
  description: 'Regolo AI — LLM provider.',
  baseUrl: 'https://api.regolo.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'llama-3.1-8b-instruct'
}

export default config
