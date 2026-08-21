import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'drun',
  name: 'D.Run (China)',
  description: 'D.Run (China) — LLM provider.',
  baseUrl: 'https://chat.d.run/v1',
  apiKeyUrl: '',
  defaultModel: 'public/deepseek-v3'
}

export default config
