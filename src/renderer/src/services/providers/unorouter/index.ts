import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'unorouter',
  name: 'UnoRouter',
  description: 'UnoRouter — LLM provider.',
  baseUrl: 'https://api.unorouter.com/v1',
  apiKeyUrl: '',
  defaultModel: 'gpt-5.5:free'
}

export default config
