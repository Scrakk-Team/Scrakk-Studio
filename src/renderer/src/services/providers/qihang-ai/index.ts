import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'qihang-ai',
  name: 'QiHang',
  description: 'QiHang — LLM provider.',
  baseUrl: 'https://api.qhaigc.net/v1',
  apiKeyUrl: '',
  defaultModel: 'claude-haiku-4-5-20251001'
}

export default config
