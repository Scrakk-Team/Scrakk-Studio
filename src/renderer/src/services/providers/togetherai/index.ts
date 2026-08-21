import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'togetherai',
  name: 'Together AI',
  description: 'Together AI — LLM provider.',
  baseUrl: 'https://api.togetherai.com/v1',
  apiKeyUrl: '',
  defaultModel: 'LiquidAI/LFM2-24B-A2B'
}

export default config
