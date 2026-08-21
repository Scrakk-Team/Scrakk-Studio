import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'inceptron',
  name: 'Inceptron',
  description: 'Inceptron — LLM provider.',
  baseUrl: 'https://api.inceptron.io/v1',
  apiKeyUrl: '',
  defaultModel: 'moonshotai/Kimi-K2.6'
}

export default config
