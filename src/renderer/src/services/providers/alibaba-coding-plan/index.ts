import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'alibaba-coding-plan',
  name: 'Alibaba Coding Plan',
  description: 'Alibaba Coding Plan — LLM provider.',
  baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/v1',
  apiKeyUrl: '',
  defaultModel: 'qwen3-coder-plus'
}

export default config
