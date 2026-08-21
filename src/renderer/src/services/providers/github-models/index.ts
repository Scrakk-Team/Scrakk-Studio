import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'github-models',
  name: 'GitHub Models',
  description: 'GitHub Models — LLM provider.',
  baseUrl: 'https://models.github.ai/inference',
  apiKeyUrl: '',
  defaultModel: 'ai21-labs/ai21-jamba-1.5-mini'
}

export default config
