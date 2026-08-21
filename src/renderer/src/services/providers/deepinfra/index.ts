import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'deepinfra',
  name: 'Deep Infra',
  description: 'Deep Infra — LLM provider.',
  baseUrl: 'https://api.deepinfra.com/v1',
  apiKeyUrl: '',
  defaultModel: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8'
}

export default config
