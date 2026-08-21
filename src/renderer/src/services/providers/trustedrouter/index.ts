import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'trustedrouter',
  name: 'TrustedRouter',
  description: 'TrustedRouter — LLM provider.',
  baseUrl: 'https://api.trustedrouter.com/v1',
  apiKeyUrl: '',
  defaultModel: 'zdr'
}

export default config
