import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'wafer.ai',
  name: 'Wafer',
  description: 'Wafer — LLM provider.',
  baseUrl: 'https://pass.wafer.ai/v1',
  apiKeyUrl: '',
  defaultModel: 'glm5.2-fast'
}

export default config
