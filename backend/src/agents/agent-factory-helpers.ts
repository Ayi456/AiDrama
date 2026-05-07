import type { SupportedAgentType } from './presets.js'
import type { StoryboardChunk } from './storyboard-chunks.js'

export type CreateAgentOptions = {
  storyboard?: {
    scriptChunk?: StoryboardChunk
    appendMode?: boolean
    clearBeforeAppend?: boolean
  }
}

type AgentModelConfig = {
  model?: string | null
}

type AgentToolFactorySet<TScriptTools, TExtractTools, TStoryboardTools, TGridPromptTools> = {
  script_rewriter: (episodeId: number) => TScriptTools
  extractor: (episodeId: number, dramaId: number) => TExtractTools
  storyboard_breaker: (
    episodeId: number,
    dramaId: number,
    storyboardOptions?: CreateAgentOptions['storyboard'],
  ) => TStoryboardTools
  grid_prompt_generator: (episodeId: number, dramaId: number) => TGridPromptTools
}

export function resolveAgentModelName(
  dbConfig: AgentModelConfig | null | undefined,
  fallbackModel: string,
) {
  const configuredModel = dbConfig?.model?.trim()
  return configuredModel || fallbackModel
}

export function mergeAgentInstructions(baseInstructions: string, skillInstructions: string) {
  const normalizedSkills = skillInstructions.trim()
  if (!normalizedSkills) return baseInstructions
  return [baseInstructions, '', normalizedSkills].join('\n')
}

export function resolveAgentTools<TScriptTools, TExtractTools, TStoryboardTools, TGridPromptTools>(
  type: string,
  episodeId: number,
  dramaId: number,
  options: CreateAgentOptions,
  factories: AgentToolFactorySet<TScriptTools, TExtractTools, TStoryboardTools, TGridPromptTools>,
) {
  switch (type) {
    case 'script_rewriter':
      return factories.script_rewriter(episodeId)
    case 'extractor':
      return factories.extractor(episodeId, dramaId)
    case 'storyboard_breaker':
      return factories.storyboard_breaker(episodeId, dramaId, options.storyboard)
    case 'grid_prompt_generator':
      return factories.grid_prompt_generator(episodeId, dramaId)
    default:
      return null
  }
}
