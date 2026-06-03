import { Agent, type ToolsInput } from '@mastra/core/agent'
import {
  createAnthropic,
  type AnthropicProvider,
  type AnthropicProviderSettings,
} from '@ai-sdk/anthropic'
import {
  createOpenAI,
  type OpenAIProvider,
  type OpenAIProviderSettings,
} from '@ai-sdk/openai'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { getTextConfig, getTextProviderBaseUrl, getTextProviderProtocol } from '../services/ai/ai.js'
import { aiFetch } from '../utils/ai-fetch.js'
import { logTaskProgress } from '../utils/task-logger.js'
import {
  mergeAgentInstructions,
  mergeMandatoryAgentInstructions,
  resolveAgentModelName,
  resolveAgentTools,
  type CreateAgentOptions,
} from './agent-factory-helpers.js'
import { getAgentPreset } from './presets.js'
import { loadAgentSkills } from './skills.js'
import { createExtractTools } from './tools/extract-tools.js'
import { createGridPromptTools } from './tools/grid-prompt-tools.js'
import { createScriptTools } from './tools/script-tools.js'
import { createStoryboardTools } from './tools/storyboard-tools.js'

export { isValidAgentType } from './presets.js'

type AgentConfigRecord = typeof schema.agentConfigs.$inferSelect
type AnthropicModelId = Parameters<AnthropicProvider['chat']>[0]
type OpenAIModelId = Parameters<OpenAIProvider['chat']>[0]

function toToolsInput(tools: Record<string, unknown>): ToolsInput {
  return Object.fromEntries(
    Object.entries(tools).filter(([, tool]) => tool != null),
  ) as ToolsInput
}

async function getAgentConfig(agentType: string): Promise<AgentConfigRecord | null> {
  const rows = (await db.select().from(schema.agentConfigs)
    .where(and(eq(schema.agentConfigs.agentType, agentType), isNull(schema.agentConfigs.deletedAt)))
    .all())
  return rows.find(row => row.isActive) || rows[0] || null
}

async function getModel(dbConfig: AgentConfigRecord | null) {
  const textConfig = await getTextConfig()
  const resolvedBaseURL = getTextProviderBaseUrl(textConfig)
  const protocol = getTextProviderProtocol(textConfig)
  const modelName = resolveAgentModelName(dbConfig, textConfig.model)

  logTaskProgress('AIConfig', 'text-model-endpoint', {
    provider: textConfig.provider,
    protocol,
    baseUrl: resolvedBaseURL,
    model: modelName,
  })

  if (protocol === 'anthropic') {
    const providerOptions: AnthropicProviderSettings = {
      baseURL: resolvedBaseURL,
      apiKey: textConfig.apiKey,
      fetch: aiFetch,
    }
    const provider = createAnthropic(providerOptions)
    return provider.chat(modelName as AnthropicModelId)
  }

  const providerOptions: OpenAIProviderSettings = {
    baseURL: resolvedBaseURL,
    apiKey: textConfig.apiKey,
    fetch: aiFetch,
  }
  const provider = createOpenAI(providerOptions)
  return provider.chat(modelName as OpenAIModelId)
}

export async function createAgent(
  type: string,
  episodeId: number,
  dramaId: number,
  options: CreateAgentOptions = {},
): Promise<Agent | null> {
  const preset = getAgentPreset(type)
  if (!preset) return null

  const dbConfig = await getAgentConfig(type)
  const model = await getModel(dbConfig)
  const configuredBaseInstructions = dbConfig?.systemPrompt?.trim() || preset.instructions
  const baseInstructions = mergeMandatoryAgentInstructions(type, configuredBaseInstructions)
  const skillInstructions = loadAgentSkills(type)
  const instructions = mergeAgentInstructions(baseInstructions, skillInstructions)
  const name = dbConfig?.name || preset.name

  const resolvedTools = resolveAgentTools(type, episodeId, dramaId, options, {
    script_rewriter: createScriptTools,
    extractor: createExtractTools,
    storyboard_breaker: createStoryboardTools,
    grid_prompt_generator: createGridPromptTools,
  })
  if (!resolvedTools) return null

  return new Agent({
    id: type,
    name,
    instructions,
    model,
    tools: toToolsInput(resolvedTools),
  })
}
