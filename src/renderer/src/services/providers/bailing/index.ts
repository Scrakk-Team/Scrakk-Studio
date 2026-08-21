import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'bailing',
  name: 'Bailing',
  description: 'Bailing — LLM provider.',
  baseUrl: 'https://api.tbox.cn/api/llm/v1',
  apiKeyUrl: '',
  defaultModel: 'Ring-1T'
}

export default config
