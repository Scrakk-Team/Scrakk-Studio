import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'tencent-tokenhub',
  name: 'Tencent TokenHub',
  description: 'Tencent TokenHub — LLM provider.',
  baseUrl: 'https://tokenhub.tencentmaas.com/v1',
  apiKeyUrl: '',
  defaultModel: 'hy3'
}

export default config
