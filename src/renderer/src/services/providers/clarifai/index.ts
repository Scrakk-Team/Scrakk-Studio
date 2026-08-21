import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'clarifai',
  name: 'Clarifai',
  description: 'Clarifai — LLM provider.',
  baseUrl: 'https://api.clarifai.com/v2/ext/openai/v1',
  apiKeyUrl: '',
  defaultModel: 'moonshotai/chat-completion/models/Kimi-K2_6'
}

export default config
