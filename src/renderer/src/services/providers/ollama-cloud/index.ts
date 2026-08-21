import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'ollama-cloud',
  name: 'Ollama Cloud',
  description: 'Ollama Cloud — LLM provider.',
  baseUrl: 'https://ollama.com/v1',
  apiKeyUrl: '',
  defaultModel: 'deepseek-v4-flash'
}

export default config
