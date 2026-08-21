import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'io-net',
  name: 'IO.NET',
  description: 'IO.NET — LLM provider.',
  baseUrl: 'https://api.intelligence.io.solutions/api/v1',
  apiKeyUrl: '',
  defaultModel: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8'
}

export default config
