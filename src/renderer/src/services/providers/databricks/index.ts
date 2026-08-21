import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'databricks',
  name: 'Databricks',
  description: 'Databricks — LLM provider.',
  baseUrl: 'https://${DATABRICKS_HOST}/ai-gateway/mlflow/v1',
  apiKeyUrl: '',
  defaultModel: 'databricks-claude-opus-4-7'
}

export default config
