import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'siliconflow',
  name: 'SiliconFlow',
  description: 'SiliconFlow — LLM provider.',
  baseUrl: 'https://api.siliconflow.com/v1',
  apiKeyUrl: '',
  defaultModel: 'moonshotai/Kimi-K2.6'
}

export default config
