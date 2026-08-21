import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'zhipuai-coding-plan',
  name: 'Zhipu AI Coding Plan',
  description: 'Zhipu AI Coding Plan — LLM provider.',
  baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
  apiKeyUrl: '',
  defaultModel: 'glm-5.1'
}

export default config
