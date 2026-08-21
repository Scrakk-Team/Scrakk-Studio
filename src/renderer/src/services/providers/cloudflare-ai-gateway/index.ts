import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'cloudflare-ai-gateway',
  name: 'Cloudflare AI Gateway',
  description: 'Cloudflare AI Gateway — LLM provider.',
  baseUrl: 'https://api.cloudflare-ai-gateway.com/v1',
  apiKeyUrl: '',
  defaultModel: 'workers-ai/@cf/baai/bge-m3'
}

export default config
