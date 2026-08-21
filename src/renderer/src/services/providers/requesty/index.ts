import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'requesty',
  name: 'Requesty',
  description: 'Requesty — LLM provider.',
  baseUrl: 'https://router.requesty.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'xai/grok-4'
}

export default config
