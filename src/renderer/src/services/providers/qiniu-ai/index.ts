import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'qiniu-ai',
  name: 'Qiniu',
  description: 'Qiniu — LLM provider.',
  baseUrl: 'https://api.qnaigc.com/v1',
  apiKeyUrl: '',
  defaultModel: 'deepseek-r1-0528'
}

export default config
