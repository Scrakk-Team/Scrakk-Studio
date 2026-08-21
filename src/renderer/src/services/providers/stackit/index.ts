import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'stackit',
  name: 'STACKIT',
  description: 'STACKIT — LLM provider.',
  baseUrl: 'https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1',
  apiKeyUrl: '',
  defaultModel: 'cortecs/Llama-3.3-70B-Instruct-FP8-Dynamic'
}

export default config
