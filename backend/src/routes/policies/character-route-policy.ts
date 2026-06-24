import type { RouteBody } from '../shared/route-body.js'
import { hasOwn, readBodyId, readBodyText } from '../shared/route-body.js'

export type CharacterCreateInput = {
  dramaId: number
  episodeId: number
  characterAssetId: number
  name: string
}

export type CharacterCreateValues = {
  dramaId: number
  name: string
  role: string
  description: string
  appearance: string
  personality: string
  imagePrompt: string | null
  imageUrl: string | null
  localPath: string | null
  characterAssetId: number | null
  createdAt: string
  updatedAt: string
}

export type CharacterUpdatePatch = {
  updatedAt: string
  name?: string
  role?: string | null
  description?: string | null
  appearance?: string | null
  personality?: string | null
  imagePrompt?: string | null
  imageUrl?: string | null
  localPath?: string | null
  characterAssetId?: number | null
}

export function readCharacterCreateInput(body: RouteBody): CharacterCreateInput {
  return {
    dramaId: readBodyId(body, 'drama_id', 'dramaId'),
    episodeId: readBodyId(body, 'episode_id', 'episodeId'),
    characterAssetId: readBodyId(body, 'character_asset_id', 'characterAssetId'),
    name: readBodyText(body, 'name'),
  }
}

export function buildCharacterCreateValues(
  body: RouteBody,
  input: Pick<CharacterCreateInput, 'dramaId' | 'characterAssetId' | 'name'>,
  timestamp: string,
): CharacterCreateValues {
  return {
    dramaId: input.dramaId,
    name: input.name,
    role: readBodyText(body, 'role'),
    description: readBodyText(body, 'description'),
    appearance: readBodyText(body, 'appearance'),
    personality: readBodyText(body, 'personality'),
    imagePrompt: readBodyText(body, 'image_prompt', 'imagePrompt') || null,
    imageUrl: readBodyText(body, 'image_url', 'imageUrl') || null,
    localPath: readBodyText(body, 'local_path', 'localPath') || null,
    characterAssetId: input.characterAssetId || null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function buildCharacterUpdatePatch(body: RouteBody, updatedAt: string): CharacterUpdatePatch {
  const updates: CharacterUpdatePatch = { updatedAt }

  if (hasOwn(body, 'name')) updates.name = body.name as string
  if (hasOwn(body, 'role')) updates.role = body.role as string | null
  if (hasOwn(body, 'description')) updates.description = body.description as string | null
  if (hasOwn(body, 'appearance')) updates.appearance = body.appearance as string | null
  if (hasOwn(body, 'personality')) updates.personality = body.personality as string | null
  if (hasOwn(body, 'image_prompt')) updates.imagePrompt = body.image_prompt as string | null
  else if (hasOwn(body, 'imagePrompt')) updates.imagePrompt = body.imagePrompt as string | null
  if (hasOwn(body, 'image_url')) updates.imageUrl = body.image_url as string | null
  if (hasOwn(body, 'imageUrl')) updates.imageUrl = body.imageUrl as string | null
  if (hasOwn(body, 'local_path')) updates.localPath = body.local_path as string | null
  if (hasOwn(body, 'localPath')) updates.localPath = body.localPath as string | null
  if (hasOwn(body, 'character_asset_id')) {
    updates.characterAssetId = readBodyId(body, 'character_asset_id', 'characterAssetId') || null
  } else if (hasOwn(body, 'characterAssetId')) {
    updates.characterAssetId = readBodyId(body, 'characterAssetId') || null
  }

  return updates
}

export function readCharacterBindAssetId(body: RouteBody) {
  return readBodyId(body, 'character_asset_id', 'characterAssetId')
}
