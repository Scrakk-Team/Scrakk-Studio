import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'openai',
  name: 'OpenAI',
  description: 'OpenAI — LLM provider.',
  baseUrl: 'https://api.openai.com/v1',
  apiKeyUrl: '',
  defaultModel: 'o3'
}

export default config
