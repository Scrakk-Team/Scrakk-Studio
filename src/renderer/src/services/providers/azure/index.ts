import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'azure',
  name: 'Azure',
  description: 'Azure — LLM provider.',
  baseUrl: 'https://api.azure.com/v1',
  apiKeyUrl: '',
  defaultModel: 'codex-mini'
}

export default config
