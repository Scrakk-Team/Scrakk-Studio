import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'ovhcloud',
  name: 'OVHcloud AI Endpoints',
  description: 'OVHcloud AI Endpoints — LLM provider.',
  baseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
  apiKeyUrl: '',
  defaultModel: 'qwen3-coder-30b-a3b-instruct'
}

export default config
