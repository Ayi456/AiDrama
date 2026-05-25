import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'

export const DEFAULT_USER_ID = 'default'

export type PreferencesPayload = {
  userId: string
  autoPipelineEnabled: boolean
  autoPipelineMaxRetries: number
  autoPipelineConcurrencyImage: number
  autoPipelineConcurrencyVideo: number
}

export const DEFAULT_PREFERENCES: PreferencesPayload = {
  userId: DEFAULT_USER_ID,
  autoPipelineEnabled: false,
  autoPipelineMaxRetries: 2,
  autoPipelineConcurrencyImage: 4,
  autoPipelineConcurrencyVideo: 2,
}

export function resolvePreferencesPayload(row: Partial<PreferencesPayload> | null | undefined): PreferencesPayload {
  if (!row) return { ...DEFAULT_PREFERENCES }
  return {
    userId: row.userId ?? DEFAULT_PREFERENCES.userId,
    autoPipelineEnabled: row.autoPipelineEnabled ?? DEFAULT_PREFERENCES.autoPipelineEnabled,
    autoPipelineMaxRetries: row.autoPipelineMaxRetries ?? DEFAULT_PREFERENCES.autoPipelineMaxRetries,
    autoPipelineConcurrencyImage: row.autoPipelineConcurrencyImage ?? DEFAULT_PREFERENCES.autoPipelineConcurrencyImage,
    autoPipelineConcurrencyVideo: row.autoPipelineConcurrencyVideo ?? DEFAULT_PREFERENCES.autoPipelineConcurrencyVideo,
  }
}

const app = new Hono()

app.get('/', async (c) => {
  const rows = await db.select().from(schema.userPreferences).where(eq(schema.userPreferences.userId, DEFAULT_USER_ID))
  return c.json({ code: 0, data: resolvePreferencesPayload(rows[0] as Partial<PreferencesPayload> | undefined), message: 'ok' })
})

app.put('/', async (c) => {
  const body = await c.req.json()
  const payload = resolvePreferencesPayload({ ...body, userId: DEFAULT_USER_ID })
  const now = new Date().toISOString()

  const existing = await db.select().from(schema.userPreferences).where(eq(schema.userPreferences.userId, DEFAULT_USER_ID))
  if (existing.length) {
    await db.update(schema.userPreferences)
      .set({
        autoPipelineEnabled: payload.autoPipelineEnabled,
        autoPipelineMaxRetries: payload.autoPipelineMaxRetries,
        autoPipelineConcurrencyImage: payload.autoPipelineConcurrencyImage,
        autoPipelineConcurrencyVideo: payload.autoPipelineConcurrencyVideo,
        updatedAt: now,
      })
      .where(eq(schema.userPreferences.userId, DEFAULT_USER_ID))
  } else {
    await db.insert(schema.userPreferences).values({
      userId: DEFAULT_USER_ID,
      autoPipelineEnabled: payload.autoPipelineEnabled,
      autoPipelineMaxRetries: payload.autoPipelineMaxRetries,
      autoPipelineConcurrencyImage: payload.autoPipelineConcurrencyImage,
      autoPipelineConcurrencyVideo: payload.autoPipelineConcurrencyVideo,
      createdAt: now,
      updatedAt: now,
    })
  }

  return c.json({ code: 0, data: payload, message: 'ok' })
})

export default app
