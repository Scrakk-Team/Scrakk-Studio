import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'novita-ai',
  name: 'NovitaAI',
  description: 'NovitaAI — LLM provider.',
  baseUrl: 'https://api.novita.ai/openai',
  apiKeyUrl: '',
  defaultModel: 'inclusionai/ling-2.6-1t'
}

export default config
