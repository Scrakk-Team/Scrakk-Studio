import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'google-vertex',
  name: 'Vertex',
  description: 'Vertex — LLM provider.',
  baseUrl: 'https://api.google-vertex.com/v1',
  apiKeyUrl: '',
  defaultModel: 'gemini-2.5-pro-tts'
}

export default config
