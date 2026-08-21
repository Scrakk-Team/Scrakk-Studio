import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'synthetic',
  name: 'Synthetic',
  description: 'Synthetic — LLM provider.',
  baseUrl: 'https://api.synthetic.new/openai/v1',
  apiKeyUrl: '',
  defaultModel: 'hf:moonshotai/Kimi-K2.7-Code'
}

export default config
