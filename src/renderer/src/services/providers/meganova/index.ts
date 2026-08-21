import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'meganova',
  name: 'Meganova',
  description: 'Meganova — LLM provider.',
  baseUrl: 'https://api.meganova.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'meta-llama/Llama-3.3-70B-Instruct'
}

export default config
