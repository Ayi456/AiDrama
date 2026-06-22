import { Hono } from 'hono'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { success, created, badRequest, notFound, now } from '../../utils/response.js'
import { getCurrentUser } from '../../middleware/auth.js'
import { findOwnedCharacterAsset } from '../shared/ownership.js'
import {
  buildCharacterAssetCreateValues,
  buildCharacterAssetPublicPayload,
  buildCharacterAssetUpdatePatch,
  validateCharacterAssetCreateBody,
  type CharacterAssetBody,
} from '../policies/character-asset-route-policy.js'

const app = new Hono()

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
