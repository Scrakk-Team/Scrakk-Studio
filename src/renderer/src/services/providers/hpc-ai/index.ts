import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'hpc-ai',
  name: 'HPC-AI',
  description: 'HPC-AI — LLM provider.',
  baseUrl: 'https://api.hpc-ai.com/inference/v1',
  apiKeyUrl: '',
  defaultModel: 'moonshotai/kimi-k2.7-code'
}

export default config
