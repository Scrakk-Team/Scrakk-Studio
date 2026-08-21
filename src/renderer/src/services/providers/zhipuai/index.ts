import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'zhipuai',
  name: 'Zhipu AI',
  description: 'Zhipu AI — LLM provider.',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  apiKeyUrl: '',
  defaultModel: 'glm-5.1'
}

export default config
