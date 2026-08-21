import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'google-vertex-anthropic',
  name: 'Vertex (Anthropic)',
  description: 'Vertex (Anthropic) — LLM provider.',
  baseUrl: 'https://api.google-vertex-anthropic.com/v1',
  apiKeyUrl: '',
  defaultModel: 'claude-haiku-4-5@20251001'
}

export default config
