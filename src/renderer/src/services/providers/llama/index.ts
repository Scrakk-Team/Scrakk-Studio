import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'llama',
  name: 'Llama',
  description: 'Llama — LLM provider.',
  baseUrl: 'https://api.llama.com/compat/v1',
  apiKeyUrl: '',
  defaultModel: 'llama-4-scout-17b-16e-instruct-fp8'
}

export default config
