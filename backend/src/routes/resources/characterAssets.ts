import { Hono } from 'hono'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { success, created, badRequest, notFound, now } from '../../utils/response.js'
import { getCurrentUser } from '../../middleware/auth.js'
import { findOwnedCharacterAsset } from '../shared/ownership.js'
import { generateImage } from '../../services/generation/image-generation.js'
import { resolveCharacterImagePrompt } from '../../agents/visual-prompt-policy.js'
import { errorMessageFromUnknown } from '../../utils/error.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../utils/task-logger.js'
import {
  buildCharacterAssetCreateValues,
  buildCharacterAssetPublicPayload,
  buildCharacterAssetUpdatePatch,
  validateCharacterAssetCreateBody,
  type CharacterAssetBody,
} from '../policies/character-asset-route-policy.js'

const app = new Hono()

type CharacterAssetRow = typeof schema.characterAssets.$inferSelect

const ROLE_PRESET_LABELS: Record<string, string> = {
  male_lead: 'male lead',
  female_lead: 'female lead',
  supporting: 'supporting character',
  villain: 'villain',
  custom: 'character',
}

function parseAssetTags(value: string | null | undefined) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(item => String(item || '').trim()).filter(Boolean) : []
  } catch {
    return value.split(/[,，\n]/).map(item => item.trim()).filter(Boolean)
  }
}

function buildCharacterAssetImagePrompt(asset: CharacterAssetRow) {
  const tags = parseAssetTags(asset.tags)
  const rolePreset = asset.rolePreset || 'custom'
  const genderText = asset.gender && asset.gender !== 'unknown' ? `gender: ${asset.gender}` : ''
  const description = [
    asset.description || '',
    genderText,
    tags.length ? `tags: ${tags.join(', ')}` : '',
  ].filter(Boolean).join('，')

  const basePrompt = resolveCharacterImagePrompt({
    name: asset.name,
    role: ROLE_PRESET_LABELS[rolePreset] || ROLE_PRESET_LABELS.custom,
    description,
    appearance: asset.appearance || asset.description || '',
    personality: '',
    style: '写实电影感',
  })

  return `${basePrompt}，参考上传的角色参考图进行图生图，保留人物身份特征、脸型气质、服装轮廓和整体风格，生成可复用的角色形象设定图`
}

app.get('/', async (c) => {
  const currentUser = getCurrentUser(c)
  const rows = await db.select().from(schema.characterAssets)
    .where(and(eq(schema.characterAssets.userId, currentUser.id), isNull(schema.characterAssets.deletedAt)))
    .all()
  return success(c, rows.map(buildCharacterAssetPublicPayload))
})

app.post('/', async (c) => {
  const currentUser = getCurrentUser(c)
  const body = await c.req.json() as CharacterAssetBody
  const validationError = validateCharacterAssetCreateBody(body)
  if (validationError) return badRequest(c, validationError)

  const values = { ...buildCharacterAssetCreateValues(body, now()), userId: currentUser.id }
  const result = await db.insert(schema.characterAssets).values(values).run()
  const id = Number(result.lastInsertRowid)

  if (values.isDefault) await setDefaultAsset(id, currentUser.id, values.rolePreset, values.updatedAt)

  const [row] = await db.select().from(schema.characterAssets).where(eq(schema.characterAssets.id, id)).all()
  return created(c, buildCharacterAssetPublicPayload(row))
})

app.put('/:id', async (c) => {
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const existing = await findOwnedCharacterAsset(currentUser.id, id)
  if (!existing) return notFound(c)
  const body = await c.req.json() as CharacterAssetBody
  const patch = buildCharacterAssetUpdatePatch(body, now())

  await db.update(schema.characterAssets).set(patch).where(eq(schema.characterAssets.id, id)).run()
  if (patch.isDefault === true) {
    const [row] = await db.select().from(schema.characterAssets).where(eq(schema.characterAssets.id, id)).all()
    if (row) await setDefaultAsset(id, currentUser.id, row.rolePreset || 'custom', String(patch.updatedAt))
  }

  const [row] = await db.select().from(schema.characterAssets).where(eq(schema.characterAssets.id, id)).all()
  if (!row || row.deletedAt) return notFound(c)
  return success(c, buildCharacterAssetPublicPayload(row))
})

app.post('/:id/default', async (c) => {
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const row = await findOwnedCharacterAsset(currentUser.id, id)
  if (!row) return notFound(c)
  const ts = now()
  await setDefaultAsset(id, currentUser.id, row.rolePreset || 'custom', ts)
  const [updated] = await db.select().from(schema.characterAssets).where(eq(schema.characterAssets.id, id)).all()
  return success(c, buildCharacterAssetPublicPayload(updated))
})

app.post('/:id/generate-image', async (c) => {
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const asset = await findOwnedCharacterAsset(currentUser.id, id)
  if (!asset) return notFound(c)

  const referenceImage = typeof asset.referenceImage === 'string' ? asset.referenceImage.trim() : ''
  if (!referenceImage) return badRequest(c, 'reference_image is required')

  try {
    logTaskStart('CharacterAssetImage', 'generate', { characterAssetId: id, mode: 'image-to-image' })
    const genId = await generateImage({
      characterAssetId: id,
      prompt: buildCharacterAssetImagePrompt(asset),
      referenceImages: [referenceImage],
    })
    logTaskSuccess('CharacterAssetImage', 'generate', { characterAssetId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (error: unknown) {
    const message = errorMessageFromUnknown(error, 'Character asset image generation failed')
    logTaskError('CharacterAssetImage', 'generate', { characterAssetId: id, error: message })
    return badRequest(c, message)
  }
})

app.delete('/:id', async (c) => {
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const existing = await findOwnedCharacterAsset(currentUser.id, id)
  if (!existing) return notFound(c)
  await db.update(schema.characterAssets)
    .set({ deletedAt: now(), isActive: false, isDefault: false })
    .where(eq(schema.characterAssets.id, id))
    .run()
  return success(c)
})

async function setDefaultAsset(id: number, userId: number, rolePreset: string | null | undefined, updatedAt: string) {
  await db.update(schema.characterAssets)
    .set({ isDefault: false, updatedAt })
    .where(and(eq(schema.characterAssets.userId, userId), eq(schema.characterAssets.rolePreset, rolePreset || 'custom')))
    .run()
  await db.update(schema.characterAssets)
    .set({ isDefault: true, isActive: true, updatedAt })
    .where(eq(schema.characterAssets.id, id))
    .run()
}

export default app
