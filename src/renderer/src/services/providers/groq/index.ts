import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'groq',
  name: 'Groq',
  description: 'Groq — LLM provider.',
  baseUrl: 'https://api.groq.com/v1',
  apiKeyUrl: '',
  defaultModel: 'llama-3.3-70b-versatile'
}

export default config
