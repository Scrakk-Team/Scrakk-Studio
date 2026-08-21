import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'alibaba-token-plan-cn',
  name: 'Alibaba Token Plan (China)',
  description: 'Alibaba Token Plan (China) — LLM provider.',
  baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
  apiKeyUrl: '',
  defaultModel: 'deepseek-v4-flash'
}

export default config
