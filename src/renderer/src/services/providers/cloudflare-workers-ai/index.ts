import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'cloudflare-workers-ai',
  name: 'Cloudflare Workers AI',
  description: 'Cloudflare Workers AI — LLM provider.',
  baseUrl: 'https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/v1',
  apiKeyUrl: '',
  defaultModel: '@cf/ibm-granite/granite-4.0-h-micro'
}

export default config
