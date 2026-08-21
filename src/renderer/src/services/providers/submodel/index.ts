import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'submodel',
  name: 'submodel',
  description: 'submodel — LLM provider.',
  baseUrl: 'https://llm.submodel.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'Qwen/Qwen3-235B-A22B-Thinking-2507'
}

export default config
