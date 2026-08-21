import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'nvidia',
  name: 'Nvidia',
  description: 'Nvidia — LLM provider.',
  baseUrl: 'https://integrate.api.nvidia.com/v1',
  apiKeyUrl: '',
  defaultModel: 'baai/bge-m3',
  headers: { 'HTTP-Referer': 'https://scrakk.studio', 'X-Title': 'Scrakk Studio' }
}

export default config
