import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'tinfoil',
  name: 'Tinfoil',
  description: 'Tinfoil — LLM provider.',
  baseUrl: 'https://inference.tinfoil.sh/v1',
  apiKeyUrl: '',
  defaultModel: 'kimi-k2-6'
}

export default config
