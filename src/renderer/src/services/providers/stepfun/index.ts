import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'stepfun',
  name: 'StepFun',
  description: 'StepFun — LLM provider.',
  baseUrl: 'https://api.stepfun.com/v1',
  apiKeyUrl: '',
  defaultModel: 'step-1-32k'
}

export default config
