export type StoryboardCharacterBindingSource = {
  title?: string | null
  description?: string | null
  action?: string | null
  dialogue?: string | null
  result?: string | null
  director_intent?: string | null
  directorIntent?: string | null
  audience_info_change?: string | null
  audienceInfoChange?: string | null
  emotion_shift?: string | null
  emotionShift?: string | null
  dramatic_value?: string | null
  dramaticValue?: string | null
  atmosphere?: string | null
  image_prompt?: string | null
  imagePrompt?: string | null
  video_prompt?: string | null
  videoPrompt?: string | null
}

export type StoryboardCharacterBindingInput = StoryboardCharacterBindingSource & {
  character_ids?: number[] | null
}

export type StoryboardCharacterCandidate = {
  id: number
  name?: string | null
}

function normalizeText(value: unknown) {
  return String(value || '').replace(/\s+/g, '')
}

function characterNameVariants(name: string) {
  const normalized = name.trim()
  if (!normalized) return []

  const variants = new Set([normalized])
  const withoutParentheses = normalized
    .replace(/\([^)]*\)/g, '')
    .replace(/\uFF08[^\uFF09]*\uFF09/g, '')
    .trim()
  if (withoutParentheses) variants.add(withoutParentheses)

  return [...variants].filter(variant => normalizeText(variant).length >= 2)
}

function storyboardSearchText(source: StoryboardCharacterBindingSource) {
  return normalizeText([
    source.title,
    source.description,
    source.action,
    source.dialogue,
    source.result,
    source.director_intent,
    source.directorIntent,
    source.audience_info_change,
    source.audienceInfoChange,
    source.emotion_shift,
    source.emotionShift,
    source.dramatic_value,
    source.dramaticValue,
    source.atmosphere,
    source.image_prompt,
    source.imagePrompt,
    source.video_prompt,
    source.videoPrompt,
  ].filter(Boolean).join('\n'))
}

export function inferMentionedStoryboardCharacterIds(
  source: StoryboardCharacterBindingSource,
  candidates: StoryboardCharacterCandidate[],
) {
  const text = storyboardSearchText(source)
  if (!text) return []

  return candidates
    .filter(candidate => characterNameVariants(candidate.name || '').some(name => text.includes(normalizeText(name))))
    .map(candidate => candidate.id)
}

export function mergeStoryboardCharacterIds(
  explicitCharacterIds: number[] | null | undefined,
  source: StoryboardCharacterBindingSource,
  candidates: StoryboardCharacterCandidate[],
) {
  return [
    ...new Set([
      ...(explicitCharacterIds || []).filter(Boolean),
      ...inferMentionedStoryboardCharacterIds(source, candidates),
    ]),
  ]
}

export function mergeStoryboardInputCharacterIds(
  input: StoryboardCharacterBindingInput,
  candidates: StoryboardCharacterCandidate[],
) {
  return mergeStoryboardCharacterIds(input.character_ids, input, candidates)
}
