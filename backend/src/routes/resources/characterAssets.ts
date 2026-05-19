import { Hono } from 'hono'
import { eq, isNull } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { success, created, badRequest, notFound, now } from '../../utils/response.js'
import {
  buildCharacterAssetCreateValues,
  buildCharacterAssetPublicPayload,
  buildCharacterAssetUpdatePatch,
  validateCharacterAssetCreateBody,
  type CharacterAssetBody,
} from '../policies/character-asset-route-policy.js'

const app = new Hono()

app.get('/', async (c) => {
  const rows = await db.select().from(schema.characterAssets).where(isNull(schema.characterAssets.deletedAt)).all()
  return success(c, rows.map(buildCharacterAssetPublicPayload))
})

app.post('/', async (c) => {
  const body = await c.req.json() as CharacterAssetBody
  const validationError = validateCharacterAssetCreateBody(body)
  if (validationError) return badRequest(c, validationError)

  const values = buildCharacterAssetCreateValues(body, now())
  const result = await db.insert(schema.characterAssets).values(values).run()
  const id = Number(result.lastInsertRowid)

  if (values.isDefault) await setDefaultAsset(id, values.rolePreset, values.updatedAt)

  const [row] = await db.select().from(schema.characterAssets).where(eq(schema.characterAssets.id, id)).all()
  return created(c, buildCharacterAssetPublicPayload(row))
})

app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json() as CharacterAssetBody
  const patch = buildCharacterAssetUpdatePatch(body, now())

  await db.update(schema.characterAssets).set(patch).where(eq(schema.characterAssets.id, id)).run()
  if (patch.isDefault === true) {
    const [row] = await db.select().from(schema.characterAssets).where(eq(schema.characterAssets.id, id)).all()
    if (row) await setDefaultAsset(id, row.rolePreset || 'custom', String(patch.updatedAt))
  }

  const [row] = await db.select().from(schema.characterAssets).where(eq(schema.characterAssets.id, id)).all()
  if (!row || row.deletedAt) return notFound(c)
  return success(c, buildCharacterAssetPublicPayload(row))
})

app.post('/:id/default', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = await db.select().from(schema.characterAssets).where(eq(schema.characterAssets.id, id)).all()
  if (!row || row.deletedAt) return notFound(c)
  const ts = now()
  await setDefaultAsset(id, row.rolePreset || 'custom', ts)
  const [updated] = await db.select().from(schema.characterAssets).where(eq(schema.characterAssets.id, id)).all()
  return success(c, buildCharacterAssetPublicPayload(updated))
})

app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.update(schema.characterAssets)
    .set({ deletedAt: now(), isActive: false, isDefault: false })
    .where(eq(schema.characterAssets.id, id))
    .run()
  return success(c)
})

async function setDefaultAsset(id: number, rolePreset: string | null | undefined, updatedAt: string) {
  await db.update(schema.characterAssets)
    .set({ isDefault: false, updatedAt })
    .where(eq(schema.characterAssets.rolePreset, rolePreset || 'custom'))
    .run()
  await db.update(schema.characterAssets)
    .set({ isDefault: true, isActive: true, updatedAt })
    .where(eq(schema.characterAssets.id, id))
    .run()
}

export default app
