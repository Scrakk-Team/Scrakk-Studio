import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'alibaba-token-plan',
  name: 'Alibaba Token Plan',
  description: 'Alibaba Token Plan — LLM provider.',
  baseUrl: 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
  apiKeyUrl: '',
  defaultModel: 'deepseek-v4-flash'
}

export default config
