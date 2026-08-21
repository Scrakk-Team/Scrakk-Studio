import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'meta',
  name: 'Meta',
  description: 'Meta — LLM provider.',
  baseUrl: 'https://api.meta.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'muse-spark-1.1'
}

export default config
