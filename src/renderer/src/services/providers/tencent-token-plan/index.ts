import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'tencent-token-plan',
  name: 'Tencent Token Plan',
  description: 'Tencent Token Plan — LLM provider.',
  baseUrl: 'https://api.lkeap.cloud.tencent.com/plan/v3',
  apiKeyUrl: '',
  defaultModel: 'hy3'
}

export default config
