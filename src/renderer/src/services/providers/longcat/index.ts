import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'longcat',
  name: 'LongCat',
  description: 'LongCat — LLM provider.',
  baseUrl: 'https://api.longcat.chat/openai',
  apiKeyUrl: '',
  defaultModel: 'LongCat-2.0'
}

export default config
