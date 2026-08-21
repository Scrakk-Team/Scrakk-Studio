import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'subconscious',
  name: 'Subconscious',
  description: 'Subconscious — LLM provider.',
  baseUrl: 'https://api.subconscious.dev/v1',
  apiKeyUrl: '',
  defaultModel: 'subconscious/glm-5.2'
}

export default config
