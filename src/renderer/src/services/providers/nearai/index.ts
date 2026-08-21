import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'nearai',
  name: 'NEAR AI Cloud',
  description: 'NEAR AI Cloud — LLM provider.',
  baseUrl: 'https://cloud-api.near.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'google/gemini-3.1-flash-lite'
}

export default config
