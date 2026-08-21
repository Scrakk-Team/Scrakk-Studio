import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'chutes',
  name: 'Chutes',
  description: 'Chutes — LLM provider.',
  baseUrl: 'https://llm.chutes.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'moonshotai/Kimi-K2.6-TEE'
}

export default config
