import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'privatemode-ai',
  name: 'Privatemode AI',
  description: 'Privatemode AI — LLM provider.',
  baseUrl: 'http://localhost:8080/v1',
  apiKeyUrl: '',
  defaultModel: 'qwen3-embedding-4b'
}

export default config
