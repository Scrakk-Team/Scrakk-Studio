import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'google',
  name: 'Google',
  description: 'Google — LLM provider.',
  baseUrl: 'https://api.google.com/v1',
  apiKeyUrl: '',
  defaultModel: 'gemini-3.1-flash-lite'
}

export default config
