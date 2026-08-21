import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'siliconflow-cn',
  name: 'SiliconFlow (China)',
  description: 'SiliconFlow (China) — LLM provider.',
  baseUrl: 'https://api.siliconflow.cn/v1',
  apiKeyUrl: '',
  defaultModel: 'baidu/ERNIE-4.5-300B-A47B'
}

export default config
