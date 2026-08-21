import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'helicone',
  name: 'Helicone',
  description: 'Helicone — LLM provider.',
  baseUrl: 'https://ai-gateway.helicone.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'chatgpt-4o-latest'
}

export default config
