import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'openrouter',
  name: 'OpenRouter',
  description: 'OpenRouter — LLM provider.',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKeyUrl: '',
  defaultModel: 'inclusionai/ling-2.6-1t',
  headers: { 'HTTP-Referer': 'https://scrakk.studio', 'X-Title': 'Scrakk Studio' }
}

export default config
