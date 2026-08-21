import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'wandb',
  name: 'Weights & Biases',
  description: 'Weights & Biases — LLM provider.',
  baseUrl: 'https://api.inference.wandb.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'ibm-granite/granite-4.1-8b'
}

export default config
