import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'stepfun-ai',
  name: 'StepFun AI',
  description: 'StepFun AI — LLM provider.',
  baseUrl: 'https://api.stepfun.ai/step_plan/v1',
  apiKeyUrl: '',
  defaultModel: 'step-2-16k'
}

export default config
