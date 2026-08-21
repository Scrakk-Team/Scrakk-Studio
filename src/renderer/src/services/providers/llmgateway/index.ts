import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'llmgateway',
  name: 'LLM Gateway',
  description: 'LLM Gateway — LLM provider.',
  baseUrl: 'https://api.llmgateway.io/v1',
  apiKeyUrl: '',
  defaultModel: 'qwen-coder-plus'
}

export default config
