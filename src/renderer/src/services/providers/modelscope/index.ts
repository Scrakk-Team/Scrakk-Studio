import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'modelscope',
  name: 'ModelScope',
  description: 'ModelScope — LLM provider.',
  baseUrl: 'https://api-inference.modelscope.cn/v1',
  apiKeyUrl: '',
  defaultModel: 'Qwen/Qwen3-30B-A3B-Thinking-2507'
}

export default config
