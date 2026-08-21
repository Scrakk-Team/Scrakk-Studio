import type { ProviderConfig } from '../types'

export const config: ProviderConfig = {
  id: 'snowflake-cortex',
  name: 'Snowflake Cortex',
  description: 'Snowflake Cortex — LLM provider.',
  baseUrl: 'https://${SNOWFLAKE_ACCOUNT}.snowflakecomputing.com/api/v2/cortex/v1',
  apiKeyUrl: '',
  defaultModel: 'openai-gpt-5.1'
}

export default config
