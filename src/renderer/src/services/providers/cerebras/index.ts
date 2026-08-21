import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'cerebras',
  name: 'Cerebras',
  description: 'Cerebras — LLM provider.',
  baseUrl: 'https://api.cerebras.com/v1',
  apiKeyUrl: '',
  defaultModel: 'gemma-4-31b',
  headers: { 'X-Cerebras-3rd-Party-Integration': 'scrakk-studio' }
}

export default config
