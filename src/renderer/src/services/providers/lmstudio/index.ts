import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'lmstudio',
  name: 'LMStudio',
  description: 'LMStudio — LLM provider.',
  baseUrl: 'http://127.0.0.1:1234/v1',
  apiKeyUrl: '',
  defaultModel: 'openai/gpt-oss-20b'
}

export default config
