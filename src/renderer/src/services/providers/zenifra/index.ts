import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'zenifra',
  name: 'Zenifra',
  description: 'Zenifra — LLM provider.',
  baseUrl: 'https://ai.zenifra.com/v1',
  apiKeyUrl: '',
  defaultModel: 'alibaba/qwen3.6-35b-a3b'
}

export default config
