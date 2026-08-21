import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'nano-gpt',
  name: 'NanoGPT',
  description: 'NanoGPT — LLM provider.',
  baseUrl: 'https://nano-gpt.com/api/v1',
  apiKeyUrl: '',
  defaultModel: 'step-3'
}

export default config
