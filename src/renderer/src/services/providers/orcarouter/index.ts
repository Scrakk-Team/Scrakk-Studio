import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'orcarouter',
  name: 'OrcaRouter',
  description: 'OrcaRouter — LLM provider.',
  baseUrl: 'https://api.orcarouter.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'google/gemini-2.5-pro'
}

export default config
