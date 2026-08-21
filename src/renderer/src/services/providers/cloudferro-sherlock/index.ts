import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'cloudferro-sherlock',
  name: 'CloudFerro Sherlock',
  description: 'CloudFerro Sherlock — LLM provider.',
  baseUrl: 'https://api-sherlock.cloudferro.com/openai/v1',
  apiKeyUrl: '',
  defaultModel: 'meta-llama/Llama-3.3-70B-Instruct'
}

export default config
