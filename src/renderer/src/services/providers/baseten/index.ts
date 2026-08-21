import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'baseten',
  name: 'Baseten',
  description: 'Baseten — LLM provider.',
  baseUrl: 'https://inference.baseten.co/v1',
  apiKeyUrl: '',
  defaultModel: 'moonshotai/Kimi-K2.6'
}

export default config
