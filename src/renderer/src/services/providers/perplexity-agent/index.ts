import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'perplexity-agent',
  name: 'Perplexity Agent',
  description: 'Perplexity Agent — LLM provider.',
  baseUrl: 'https://api.perplexity.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'xai/grok-4-1-fast-non-reasoning'
}

export default config
