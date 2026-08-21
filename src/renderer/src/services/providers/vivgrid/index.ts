import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'vivgrid',
  name: 'Vivgrid',
  description: 'Vivgrid — LLM provider.',
  baseUrl: 'https://api.vivgrid.com/v1',
  apiKeyUrl: '',
  defaultModel: 'deepseek-v4-pro'
}

export default config
