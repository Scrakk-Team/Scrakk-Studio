import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'alibaba-cn',
  name: 'Alibaba (China)',
  description: 'Alibaba (China) — LLM provider.',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKeyUrl: '',
  defaultModel: 'qwen2-5-math-72b-instruct'
}

export default config
