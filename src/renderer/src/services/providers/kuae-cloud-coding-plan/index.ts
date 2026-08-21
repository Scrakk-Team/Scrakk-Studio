import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'kuae-cloud-coding-plan',
  name: 'KUAE Cloud Coding Plan',
  description: 'KUAE Cloud Coding Plan — LLM provider.',
  baseUrl: 'https://coding-plan-endpoint.kuaecloud.net/v1',
  apiKeyUrl: '',
  defaultModel: 'GLM-4.7'
}

export default config
