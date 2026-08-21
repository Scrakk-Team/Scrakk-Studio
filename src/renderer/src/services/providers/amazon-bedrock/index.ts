import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'amazon-bedrock',
  name: 'Amazon Bedrock',
  description: 'Amazon Bedrock — LLM provider.',
  baseUrl: 'https://api.amazon-bedrock.com/v1',
  apiKeyUrl: '',
  defaultModel: 'global.anthropic.claude-haiku-4-5-20251001-v1:0'
}

export default config
