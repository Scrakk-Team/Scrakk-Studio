import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'neon',
  name: 'Neon',
  description: 'Neon — LLM provider.',
  baseUrl: '${NEON_AI_GATEWAY_BASE_URL}/ai-gateway/mlflow/v1',
  apiKeyUrl: '',
  defaultModel: 'gemini-3-flash'
}

export default config
