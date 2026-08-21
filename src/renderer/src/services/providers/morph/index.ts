import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'morph',
  name: 'Morph',
  description: 'Morph — LLM provider.',
  baseUrl: 'https://api.morphllm.com/v1',
  apiKeyUrl: '',
  defaultModel: 'morph-v3-fast'
}

export default config
