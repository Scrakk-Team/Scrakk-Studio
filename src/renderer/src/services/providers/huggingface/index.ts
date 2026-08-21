import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'huggingface',
  name: 'Hugging Face',
  description: 'Hugging Face — LLM provider.',
  baseUrl: 'https://router.huggingface.co/v1',
  apiKeyUrl: '',
  defaultModel: 'meta-llama/Llama-3.3-70B-Instruct'
}

export default config
