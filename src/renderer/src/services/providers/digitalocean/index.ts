import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'digitalocean',
  name: 'DigitalOcean',
  description: 'DigitalOcean — LLM provider.',
  baseUrl: 'https://inference.do-ai.run/v1',
  apiKeyUrl: '',
  defaultModel: 'anthropic-claude-haiku-4.5'
}

export default config
