import { and, eq } from 'drizzle-orm'

import type { AIConfig } from '../services/ai/ai.js'
import { joinProviderUrl } from '../services/adapters/url.js'
import { logTaskProgress, logTaskSuccess } from '../utils/task-logger.js'
import { now } from '../utils/response.js'
import type { NormalizedToolResult } from './result-normalizer.js'

type DirectAgentName = 'script_rewriter' | 'extractor'
type DirectMessage = {
  role: 'system' | 'user'
  content: string
}

type DirectCharacter = {
  name: string
  role?: string
  description?: string
  appearance?: string
  personality?: string
}

type DirectScene = {
  location: string
  time?: string
  prompt?: string
}

type DirectExtractorPayload = {
  characters: Required<DirectCharacter>[]
  scenes: Required<DirectScene>[]
}

type DirectSaveCharactersResult = {
  message: string
  created: number
  merged: number
}

type DirectSaveScenesResult = {
  message: string
  created: number
  reused: number
}

export type DirectChatCompletionInput = {
  url: string
  config: AIConfig
  body: {
    model: string
    messages: DirectMessage[]
    temperature: number
    tools?: undefined
    tool_choice?: undefined
  }
}

export type DirectAgentResult = {
  type: 'done'
  agentMode: 'direct'
  text: string
  toolCalls: []
  toolResults: NormalizedToolResult[]
}

type DirectAgentRequest = {
  dramaId: number
  episodeId: number
  message: string
}

type DirectAgentDeps = {
  getTextConfig?: () => Promise<AIConfig>
  completeText?: (input: DirectChatCompletionInput) => Promise<string>
  loadEpisodeContent?: (episodeId: number, purpose: DirectAgentName) => Promise<string>
  saveEpisodeScript?: (episodeId: number, content: string) => Promise<{ message: string; word_count: number }>
  loadExistingCharacters?: (episodeId: number, dramaId: number) => Promise<unknown[]>
  loadExistingScenes?: (episodeId: number, dramaId: number) => Promise<unknown[]>
  saveCharacters?: (episodeId: number, dramaId: number, characters: Required<DirectCharacter>[]) => Promise<DirectSaveCharactersResult>
  saveScenes?: (episodeId: number, dramaId: number, scenes: Required<DirectScene>[]) => Promise<DirectSaveScenesResult>
}

async function loadDb() {
  return import('../db/index.js')
}

async function loadTextConfig() {
  const { getTextConfig } = await import('../services/ai/ai.js')
  return getTextConfig()
}

function getDirectTextProviderBaseUrl(config: AIConfig) {
  const provider = config.provider.toLowerCase()

  if (provider === 'openai' || provider === 'openrouter' || provider === 'chatfire') {
    return joinProviderUrl(config.baseUrl, '/v1', '')
  }

  if (provider === 'volcengine') {
    return joinProviderUrl(config.baseUrl, '/api/v3', '')
  }

  if (provider === 'ali') {
    return joinProviderUrl(config.baseUrl, '/api/v1', '')
  }

  return config.baseUrl
}

function isDirectAgentName(agentType: string): agentType is DirectAgentName {
  return agentType === 'script_rewriter' || agentType === 'extractor'
}

function isMimoTextConfig(config: Pick<AIConfig, 'provider' | 'baseUrl' | 'model'>) {
  const fingerprint = [
    config.provider,
    config.baseUrl,
    config.model,
  ].join(' ').toLowerCase()

  return fingerprint.includes('xiaomimimo.com') || /\bmimo[-_]/.test(fingerprint)
}

export function shouldUseDirectAgentMode(
  agentType: string,
  config: Pick<AIConfig, 'provider' | 'baseUrl' | 'model'>,
) {
  return isDirectAgentName(agentType) && isMimoTextConfig(config)
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeCharacter(value: unknown): Required<DirectCharacter> | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const name = normalizeString(record.name)
  if (!name) return null
  return {
    name,
    role: normalizeString(record.role),
    description: normalizeString(record.description),
    appearance: normalizeString(record.appearance),
    personality: normalizeString(record.personality),
  }
}

function normalizeScene(value: unknown): Required<DirectScene> | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const location = normalizeString(record.location)
  if (!location) return null
  return {
    location,
    time: normalizeString(record.time),
    prompt: normalizeString(record.prompt),
  }
}

function extractJsonCandidate(text: string) {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenced) return fenced[1].trim()

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
}

export function parseDirectExtractorResponse(text: string): DirectExtractorPayload {
  const raw = extractJsonCandidate(text)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Extractor direct mode did not return valid JSON')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Extractor direct mode returned a non-object JSON payload')
  }

  const record = parsed as Record<string, unknown>
  const characters = Array.isArray(record.characters)
    ? record.characters.map(normalizeCharacter).filter((item): item is Required<DirectCharacter> => !!item)
    : []
  const scenes = Array.isArray(record.scenes)
    ? record.scenes.map(normalizeScene).filter((item): item is Required<DirectScene> => !!item)
    : []

  return { characters, scenes }
}

function buildDirectChatCompletionInput(config: AIConfig, messages: DirectMessage[]): DirectChatCompletionInput {
  const model = config.model.trim()
  if (!model) throw new Error('No text AI model configured')

  return {
    url: joinProviderUrl(getDirectTextProviderBaseUrl(config), '', '/chat/completions'),
    config,
    body: {
      model,
      messages,
      temperature: 0,
    },
  }
}

function contentToText(content: unknown) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content.map((part) => {
    if (typeof part === 'string') return part
    if (!part || typeof part !== 'object') return ''
    const record = part as Record<string, unknown>
    return typeof record.text === 'string' ? record.text : ''
  }).join('')
}

async function completeTextWithOpenAICompatible(input: DirectChatCompletionInput) {
  const response = await fetch(input.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${input.config.apiKey}`,
    },
    body: JSON.stringify(input.body),
    signal: AbortSignal.timeout(120_000),
  })

  const bodyText = await response.text()
  let payload: unknown = null
  try {
    payload = bodyText ? JSON.parse(bodyText) : null
  } catch {}

  if (!response.ok) {
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null
    const error = record?.error && typeof record.error === 'object'
      ? record.error as Record<string, unknown>
      : null
    const message = normalizeString(error?.message) || `Text API failed ${response.status}`
    const param = normalizeString(error?.param)
    throw new Error(param ? `${message}: ${param}` : message)
  }

  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null
  const choices = Array.isArray(record?.choices) ? record.choices : []
  const firstChoice = choices[0] && typeof choices[0] === 'object' ? choices[0] as Record<string, unknown> : null
  const message = firstChoice?.message && typeof firstChoice.message === 'object'
    ? firstChoice.message as Record<string, unknown>
    : null
  const content = contentToText(message?.content || firstChoice?.text)

  if (!content.trim()) throw new Error('Text AI response is empty')
  return content
}

async function completeDirectText(config: AIConfig, messages: DirectMessage[], deps: DirectAgentDeps) {
  const input = buildDirectChatCompletionInput(config, messages)
  return (deps.completeText || completeTextWithOpenAICompatible)(input)
}

async function defaultLoadEpisodeContent(episodeId: number, purpose: DirectAgentName) {
  const { db, schema } = await loadDb()
  const [episode] = (await db.select().from(schema.episodes)
    .where(eq(schema.episodes.id, episodeId)).all())
  if (!episode) throw new Error('Episode not found')

  const content = purpose === 'script_rewriter'
    ? episode.content || episode.scriptContent || ''
    : episode.scriptContent || episode.content || ''
  if (!content.trim()) throw new Error('Episode has no script content')
  return content
}

async function defaultSaveEpisodeScript(episodeId: number, content: string) {
  const { db, schema } = await loadDb()
  await db.update(schema.episodes)
    .set({ scriptContent: content, updatedAt: now() })
    .where(eq(schema.episodes.id, episodeId))
    .run()
  return { message: 'Script saved', word_count: content.length }
}

function slimCharacter(row: unknown) {
  const record = row && typeof row === 'object' ? row as Record<string, unknown> : {}
  return {
    id: record.id,
    name: record.name,
    role: record.role,
    description: record.description,
    appearance: record.appearance,
    personality: record.personality,
  }
}

function slimScene(row: unknown) {
  const record = row && typeof row === 'object' ? row as Record<string, unknown> : {}
  return {
    id: record.id,
    location: record.location,
    time: record.time,
    prompt: record.prompt,
  }
}

async function defaultLoadExistingCharacters(_episodeId: number, dramaId: number) {
  const { db, schema } = await loadDb()
  return (await db.select().from(schema.characters)
    .where(eq(schema.characters.dramaId, dramaId)).all())
    .filter(character => !character.deletedAt)
}

async function defaultLoadExistingScenes(_episodeId: number, dramaId: number) {
  const { db, schema } = await loadDb()
  return (await db.select().from(schema.scenes)
    .where(eq(schema.scenes.dramaId, dramaId)).all())
    .filter(scene => !scene.deletedAt)
}

async function linkCharToEpisode(episodeId: number, characterId: number) {
  const { db, schema } = await loadDb()
  const existing = (await db.select().from(schema.episodeCharacters)
    .where(and(
      eq(schema.episodeCharacters.episodeId, episodeId),
      eq(schema.episodeCharacters.characterId, characterId),
    ))
    .all())

  if (!existing.length) {
    await db.insert(schema.episodeCharacters)
      .values({ episodeId, characterId, createdAt: now() })
      .run()
  }
}

async function linkSceneToEpisode(episodeId: number, sceneId: number) {
  const { db, schema } = await loadDb()
  const existing = (await db.select().from(schema.episodeScenes)
    .where(and(
      eq(schema.episodeScenes.episodeId, episodeId),
      eq(schema.episodeScenes.sceneId, sceneId),
    ))
    .all())

  if (!existing.length) {
    await db.insert(schema.episodeScenes)
      .values({ episodeId, sceneId, createdAt: now() })
      .run()
  }
}

async function defaultSaveCharacters(
  episodeId: number,
  dramaId: number,
  characters: Required<DirectCharacter>[],
): Promise<DirectSaveCharactersResult> {
  const { db, schema } = await loadDb()
  const ts = now()
  const results = { created: 0, merged: 0 }

  for (const character of characters) {
    const existing = (await db.select().from(schema.characters)
      .where(eq(schema.characters.dramaId, dramaId)).all())
      .filter(row => !row.deletedAt)
      .find(row => row.name === character.name)

    if (existing) {
      await db.update(schema.characters).set({
        role: character.role || existing.role,
        description: character.description || existing.description,
        appearance: character.appearance || existing.appearance,
        personality: character.personality || existing.personality,
        updatedAt: ts,
      }).where(eq(schema.characters.id, existing.id)).run()
      await linkCharToEpisode(episodeId, existing.id)
      results.merged++
    } else {
      const insertResult = await db.insert(schema.characters).values({
        name: character.name,
        role: character.role,
        description: character.description,
        appearance: character.appearance,
        personality: character.personality,
        dramaId,
        createdAt: ts,
        updatedAt: ts,
      }).run()
      await linkCharToEpisode(episodeId, Number(insertResult.lastInsertRowid))
      results.created++
    }
  }

  return {
    message: `Characters saved: created ${results.created}, merged ${results.merged}`,
    ...results,
  }
}

async function defaultSaveScenes(
  episodeId: number,
  dramaId: number,
  scenes: Required<DirectScene>[],
): Promise<DirectSaveScenesResult> {
  const { db, schema } = await loadDb()
  const ts = now()
  const results = { created: 0, reused: 0 }

  for (const scene of scenes) {
    const existing = (await db.select().from(schema.scenes)
      .where(eq(schema.scenes.dramaId, dramaId)).all())
      .filter(row => !row.deletedAt)
      .find(row => row.location === scene.location && row.time === scene.time)

    if (existing) {
      await linkSceneToEpisode(episodeId, existing.id)
      results.reused++
    } else {
      const insertResult = await db.insert(schema.scenes).values({
        dramaId,
        location: scene.location,
        time: scene.time,
        prompt: scene.prompt || scene.location,
        createdAt: ts,
        updatedAt: ts,
      }).run()
      await linkSceneToEpisode(episodeId, Number(insertResult.lastInsertRowid))
      results.created++
    }
  }

  return {
    message: `Scenes saved: created ${results.created}, reused ${results.reused}`,
    ...results,
  }
}

function toolResult(toolName: string, result: unknown): NormalizedToolResult {
  return {
    toolName,
    result: JSON.stringify(result ?? null),
  }
}

function buildRewriteMessages(message: string, source: string): DirectMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are AiDrama script rewrite engine.',
        'Do not call tools. Return only the rewritten screenplay text.',
        'Use Chinese screenplay formatting suitable for later character, scene, and storyboard extraction.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        message || 'Rewrite the source into a formatted short drama screenplay.',
        '',
        'Formatting rules:',
        '- Scene heading: # S<number> | interior/exterior · location | time',
        '- Dialogue: character name: (state/expression) line',
        '- Keep stable character names, locations, and time periods.',
        '- Remove prose that does not support visual production.',
        '',
        'Source:',
        source,
      ].join('\n'),
    },
  ]
}

function buildExtractorMessages(
  message: string,
  script: string,
  existingCharacters: unknown[],
  existingScenes: unknown[],
): DirectMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are AiDrama extraction engine.',
        'Do not call tools. Return only valid JSON. Do not wrap it in markdown.',
        'JSON schema: {"characters":[{"name":"","role":"","description":"","appearance":"","personality":""}],"scenes":[{"location":"","time":"","prompt":""}]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        message || 'Extract characters and scenes from the screenplay.',
        '',
        'Rules:',
        '- Only extract characters and scenes that appear in the current episode.',
        '- Prefer existing character names and existing location/time pairs when they match.',
        '- appearance must contain visible traits only.',
        '- scene prompt must be Chinese and describe light, color, space atmosphere, and visual elements.',
        '',
        `Existing characters:\n${JSON.stringify(existingCharacters.map(slimCharacter), null, 2)}`,
        '',
        `Existing scenes:\n${JSON.stringify(existingScenes.map(slimScene), null, 2)}`,
        '',
        `Screenplay:\n${script}`,
      ].join('\n'),
    },
  ]
}

async function runDirectScriptRewrite(
  config: AIConfig,
  request: DirectAgentRequest,
  deps: DirectAgentDeps,
): Promise<DirectAgentResult> {
  const loadEpisodeContent = deps.loadEpisodeContent || defaultLoadEpisodeContent
  const saveEpisodeScript = deps.saveEpisodeScript || defaultSaveEpisodeScript
  const source = await loadEpisodeContent(request.episodeId, 'script_rewriter')
  const rewritten = (await completeDirectText(
    config,
    buildRewriteMessages(request.message, source),
    deps,
  )).trim()
  const saveResult = await saveEpisodeScript(request.episodeId, rewritten)

  logTaskSuccess('AgentDirect', 'script-rewrite', {
    episodeId: request.episodeId,
    sourceLength: source.length,
    resultLength: rewritten.length,
  })

  return {
    type: 'done',
    agentMode: 'direct',
    text: rewritten,
    toolCalls: [],
    toolResults: [toolResult('save_script', saveResult)],
  }
}

async function runDirectExtractor(
  config: AIConfig,
  request: DirectAgentRequest,
  deps: DirectAgentDeps,
): Promise<DirectAgentResult> {
  const loadEpisodeContent = deps.loadEpisodeContent || defaultLoadEpisodeContent
  const loadExistingCharacters = deps.loadExistingCharacters || defaultLoadExistingCharacters
  const loadExistingScenes = deps.loadExistingScenes || defaultLoadExistingScenes
  const saveCharacters = deps.saveCharacters || defaultSaveCharacters
  const saveScenes = deps.saveScenes || defaultSaveScenes

  const [script, existingCharacters, existingScenes] = await Promise.all([
    loadEpisodeContent(request.episodeId, 'extractor'),
    loadExistingCharacters(request.episodeId, request.dramaId),
    loadExistingScenes(request.episodeId, request.dramaId),
  ])
  const responseText = await completeDirectText(
    config,
    buildExtractorMessages(request.message, script, existingCharacters, existingScenes),
    deps,
  )
  const payload = parseDirectExtractorResponse(responseText)
  const characterResult = await saveCharacters(request.episodeId, request.dramaId, payload.characters)
  const sceneResult = await saveScenes(request.episodeId, request.dramaId, payload.scenes)

  logTaskSuccess('AgentDirect', 'extract', {
    episodeId: request.episodeId,
    dramaId: request.dramaId,
    characters: payload.characters.length,
    scenes: payload.scenes.length,
  })

  return {
    type: 'done',
    agentMode: 'direct',
    text: responseText,
    toolCalls: [],
    toolResults: [
      toolResult('save_dedup_characters', characterResult),
      toolResult('save_dedup_scenes', sceneResult),
    ],
  }
}

export async function runDirectAgentIfNeeded(
  agentType: string,
  request: DirectAgentRequest,
  deps: DirectAgentDeps = {},
): Promise<DirectAgentResult | null> {
  const config = deps.getTextConfig ? await deps.getTextConfig() : await loadTextConfig()
  if (!shouldUseDirectAgentMode(agentType, config)) return null

  logTaskProgress('Agent', 'mode-selected', {
    agentType,
    agentMode: 'direct',
    provider: config.provider,
    model: config.model,
  })

  if (agentType === 'script_rewriter') return runDirectScriptRewrite(config, request, deps)
  if (agentType === 'extractor') return runDirectExtractor(config, request, deps)
  return null
}
