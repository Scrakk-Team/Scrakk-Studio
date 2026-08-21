import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'gitlab',
  name: 'GitLab Duo',
  description: 'GitLab Duo — LLM provider.',
  baseUrl: 'https://api.gitlab.com/v1',
  apiKeyUrl: '',
  defaultModel: 'duo-chat-opus-4-5'
}

export default config
