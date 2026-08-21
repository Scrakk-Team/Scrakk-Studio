import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'iflowcn',
  name: 'iFlow',
  description: 'iFlow — LLM provider.',
  baseUrl: 'https://apis.iflow.cn/v1',
  apiKeyUrl: '',
  defaultModel: 'qwen3-coder-plus'
}

export default config
