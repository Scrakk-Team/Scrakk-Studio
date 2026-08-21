import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'empiriolabs',
  name: 'EmpirioLabs AI',
  description: 'EmpirioLabs AI — LLM provider.',
  baseUrl: 'https://api.empiriolabs.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'qwen3-5-plus'
}

export default config
