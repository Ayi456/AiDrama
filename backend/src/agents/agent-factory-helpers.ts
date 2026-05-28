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

const mandatoryAgentInstructions: Partial<Record<SupportedAgentType, string>> = {
  extractor: [
    '## Mandatory Scene Prompt Policy',
    '- scene.prompt 是可复用的场景资产提示词，用于生成空场景/环境图，不是当前剧情摘要。',
    '- scene.prompt 只能描述地点、时间、建筑结构、陈设道具、光线、色调、空间氛围和镜头质感。',
    '- scene.prompt 不得包含具体人物、人物外貌、人物动作、对白、剧情事件、谁看向谁、谁询问谁、能力触发等内容。',
    '- 不要把当前剧情摘要写进 scene.prompt；如果原文同时出现人物动作和环境，只保留环境部分。',
  ].join('\n'),
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

export function mergeMandatoryAgentInstructions(type: string, baseInstructions: string) {
  const mandatory = mandatoryAgentInstructions[type as SupportedAgentType]?.trim()
  if (!mandatory) return baseInstructions
  if (baseInstructions.includes(mandatory)) return baseInstructions
  return [baseInstructions, '', mandatory].join('\n')
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
