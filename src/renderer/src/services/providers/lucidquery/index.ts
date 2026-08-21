import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'lucidquery',
  name: 'LucidQuery',
  description: 'LucidQuery — LLM provider.',
  baseUrl: 'https://api.lucidquery.com/v1',
  apiKeyUrl: '',
  defaultModel: 'lucidnova-rf1-100b'
}

export default config
