import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'github-copilot',
  name: 'GitHub Copilot',
  description: 'GitHub Copilot — LLM provider.',
  baseUrl: 'https://api.githubcopilot.com',
  apiKeyUrl: '',
  defaultModel: 'claude-sonnet-4.5'
}

export default config
