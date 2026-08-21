import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'vercel',
  name: 'Vercel AI Gateway',
  description: 'Vercel AI Gateway — LLM provider.',
  baseUrl: 'https://api.vercel.com/v1',
  apiKeyUrl: '',
  defaultModel: 'xai/grok-imagine-video-1.5'
}

export default config
