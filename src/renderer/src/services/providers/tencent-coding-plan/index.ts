import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'tencent-coding-plan',
  name: 'Tencent Coding Plan (China)',
  description: 'Tencent Coding Plan (China) — LLM provider.',
  baseUrl: 'https://api.lkeap.cloud.tencent.com/coding/v3',
  apiKeyUrl: '',
  defaultModel: 'minimax-m2.5'
}

export default config
