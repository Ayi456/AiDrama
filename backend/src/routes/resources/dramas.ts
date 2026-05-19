import { Hono } from 'hono'
import { eq, isNull, desc } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { success, badRequest, notFound, created, now } from '../../utils/response.js'
import { toSnakeCase, toSnakeCaseArray } from '../../utils/transform.js'
import { readJsonBody } from '../shared/route-body.js'
import {
  buildDramaCreateValues,
  buildDramaEpisodeValues,
  buildDramaUpdatePatch,
  readDramaBodyNumber,
  readDramaConfigIds,
} from '../policies/drama-route-policy.js'

const app = new Hono()

// GET /dramas - List dramas
app.get('/', async (c) => {
  const page = Number(c.req.query('page') || 1)
  const pageSize = Number(c.req.query('page_size') || 20)
  const status = c.req.query('status')
  const keyword = c.req.query('keyword')

  const query = db.select().from(schema.dramas).where(isNull(schema.dramas.deletedAt))
  const allRows = await query.orderBy(desc(schema.dramas.updatedAt))
  let filtered = allRows

  if (status) filtered = filtered.filter((d) => d.status === status)
  if (keyword) filtered = filtered.filter((d) => d.title.includes(keyword))

  const total = filtered.length
  const items = filtered.slice((page - 1) * pageSize, page * pageSize)

  const enriched = await Promise.all(items.map(async (drama) => {
    const eps = await db.select().from(schema.episodes).where(eq(schema.episodes.dramaId, drama.id))
    const chars = await db.select().from(schema.characters).where(eq(schema.characters.dramaId, drama.id))
    const scns = await db.select().from(schema.scenes).where(eq(schema.scenes.dramaId, drama.id))
    return {
      ...toSnakeCase(drama),
      tags: drama.tags ? JSON.parse(drama.tags) : [],
      total_episodes: eps.length,
      episodes: toSnakeCaseArray(eps),
      characters: toSnakeCaseArray(chars),
      scenes: toSnakeCaseArray(scns),
    }
  }))

  return success(c, {
    items: enriched,
    pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
  })
})

// POST /dramas - Create drama
app.post('/', async (c) => {
  const body = await readJsonBody(c)
  const ts = now()
  const { imageConfigId: requestedImageConfigId, videoConfigId: requestedVideoConfigId } = readDramaConfigIds(body)

  const allConfigs = await db.select().from(schema.aiServiceConfigs).all()
  const fallbackImageConfigId = requestedImageConfigId ?? allConfigs.find((row) => row.serviceType === 'image' && row.isActive)?.id ?? null
  const fallbackVideoConfigId = requestedVideoConfigId ?? allConfigs.find((row) => row.serviceType === 'video' && row.isActive)?.id ?? null

  const res = await db.insert(schema.dramas).values(
    buildDramaCreateValues(body, ts, fallbackImageConfigId, fallbackVideoConfigId),
  ).run()

  const [result] = await db.select().from(schema.dramas)
    .where(eq(schema.dramas.id, Number(res.lastInsertRowid)))
    .all()

  const totalEpisodes = Math.max(1, Math.floor(readDramaBodyNumber(body, 'total_episodes') || 1))
  for (let i = 1; i <= totalEpisodes; i++) {
    await db.insert(schema.episodes).values(
      buildDramaEpisodeValues(result.id, i, undefined, ts, fallbackImageConfigId, fallbackVideoConfigId),
    ).run()
  }

  return created(c, toSnakeCase(result))
})

// GET /dramas/stats - must be before /:id
app.get('/stats', async (c) => {
  const all = await db.select().from(schema.dramas).where(isNull(schema.dramas.deletedAt)).all()
  const byStatus = Object.entries(
    all.reduce((acc, drama) => {
      acc[drama.status || 'draft'] = (acc[drama.status || 'draft'] || 0) + 1
      return acc
    }, {} as Record<string, number>),
  ).map(([status, count]) => ({ status, count }))
  return success(c, { total: all.length, by_status: byStatus })
})

// GET /dramas/:id - Get drama detail
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, id))
  if (!drama) return notFound(c, '剧本不存在')

  const eps = await db.select().from(schema.episodes).where(eq(schema.episodes.dramaId, id))
  const chars = await db.select().from(schema.characters).where(eq(schema.characters.dramaId, id))
  const scns = await db.select().from(schema.scenes).where(eq(schema.scenes.dramaId, id))
  const prps = await db.select().from(schema.props).where(eq(schema.props.dramaId, id))

  return success(c, {
    ...toSnakeCase(drama),
    tags: drama.tags ? JSON.parse(drama.tags) : [],
    episodes: toSnakeCaseArray(eps),
    characters: toSnakeCaseArray(chars),
    scenes: toSnakeCaseArray(scns),
    props: toSnakeCaseArray(prps),
  })
})

// PUT /dramas/:id - Update drama
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await readJsonBody(c)
  const updates = buildDramaUpdatePatch(body, now())
  await db.update(schema.dramas).set(updates).where(eq(schema.dramas.id, id)).run()
  return success(c)
})

// DELETE /dramas/:id - Soft delete
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.update(schema.dramas).set({ deletedAt: now() }).where(eq(schema.dramas.id, id))
  return success(c)
})

// PUT /dramas/:id/characters - Save characters
app.put('/:id/characters', async (c) => {
  const dramaId = Number(c.req.param('id'))
  const body = await c.req.json()
  const chars = body.characters || []
  const ts = now()

  for (const char of chars) {
    if (char.id) {
      await db.update(schema.characters).set({ ...char, updatedAt: ts }).where(eq(schema.characters.id, char.id))
    } else {
      await db.insert(schema.characters).values({ ...char, dramaId, createdAt: ts, updatedAt: ts })
    }
  }
  return success(c)
})

// PUT /dramas/:id/chapters - Save chapters
app.put('/:id/chapters', async (c) => {
  const dramaId = Number(c.req.param('id'))
  const body = await c.req.json()
  const episodes = body.episodes || []
  const ts = now()

  for (const ep of episodes) {
    const episodeNumber = ep.episode_number || ep.episodeNumber || 1
    if (ep.id) {
      await db.update(schema.episodes).set({ ...ep, updatedAt: ts }).where(eq(schema.episodes.id, ep.id))
    } else {
      await db.insert(schema.episodes).values({
        ...ep,
        dramaId,
        episodeNumber,
        title: ep.title || `Chapter ${episodeNumber}`,
        createdAt: ts,
        updatedAt: ts,
      })
    }
  }
  return success(c)
})

export default app
