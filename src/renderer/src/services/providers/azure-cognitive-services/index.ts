import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'azure-cognitive-services',
  name: 'Azure Cognitive Services',
  description: 'Azure Cognitive Services — LLM provider.',
  baseUrl: 'https://${AZURE_COGNITIVE_SERVICES_RESOURCE_NAME}.services.ai.azure.com/anthropic/v1',
  apiKeyUrl: '',
  defaultModel: 'claude-opus-4-5'
}

export default config
