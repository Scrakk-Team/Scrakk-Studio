import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'sap-ai-core',
  name: 'SAP AI Core',
  description: 'SAP AI Core — LLM provider.',
  baseUrl: 'https://api.sap-ai-core.com/v1',
  apiKeyUrl: '',
  defaultModel: 'anthropic--claude-4.8-opus'
}

export default config
