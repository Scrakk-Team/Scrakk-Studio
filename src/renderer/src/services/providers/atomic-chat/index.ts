import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'atomic-chat',
  name: 'Atomic Chat',
  description: 'Atomic Chat — LLM provider.',
  baseUrl: 'http://127.0.0.1:1337/v1',
  apiKeyUrl: '',
  defaultModel: 'gemma-4-E4B-it-IQ4_XS'
}

export default config
