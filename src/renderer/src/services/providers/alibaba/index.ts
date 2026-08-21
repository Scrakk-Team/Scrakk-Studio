import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'alibaba',
  name: 'Alibaba',
  description: 'Alibaba — LLM provider.',
  baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  apiKeyUrl: '',
  defaultModel: 'qwen3-omni-flash'
}

export default config
