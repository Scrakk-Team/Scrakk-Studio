import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'freemodel',
  name: 'FreeModel',
  description: 'FreeModel — LLM provider.',
  baseUrl: 'https://cc.freemodel.dev/v1',
  apiKeyUrl: '',
  defaultModel: 'claude-haiku-4-5-20251001'
}

export default config
