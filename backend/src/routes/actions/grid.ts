import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { success, badRequest, now } from '../../utils/response.js'
import { generateImage } from '../../services/generation/image-generation.js'
import { splitGridImage } from '../../services/image/grid-split.js'
import { createAgent } from '../../agents/index.js'
import { logTaskError, logTaskPayload, logTaskProgress } from '../../utils/task-logger.js'
import { uploadStaticAssetToCos } from '../../utils/cos.js'
import { presentImageGenerationAsset } from '../../utils/public-asset.js'
import { errorMessageFromUnknown } from '../../utils/error.js'
import { readJsonBody, readBodyNumber, readBodyObjectArray } from '../shared/route-body.js'
import { normalizeGridAssignments } from '../policies/grid-route-policy.js'
import {
  buildGridCellPrompts,
  buildGridPrompt,
  buildReferenceLegend,
  findGridPayload,
  parseGridJsonArray,
  type GridReferenceAsset,
} from '../policies/grid-prompt-policy.js'
import { getCurrentUser } from '../../middleware/auth.js'
import {
  findOwnedDrama,
  findOwnedImageGeneration,
  findOwnedStoryboard,
} from '../shared/ownership.js'

const app = new Hono()

type GridStoryboardsRow = typeof schema.storyboards.$inferSelect

async function getStoryboardCharacterIds(storyboardIds: number[]) {
  if (!storyboardIds.length) return new Map<number, number[]>()
  const links = (await db.select().from(schema.storyboardCharacters).all())
    .filter((link) => storyboardIds.includes(link.storyboardId))
  const map = new Map<number, number[]>()
  for (const link of links) {
    const arr = map.get(link.storyboardId) || []
    arr.push(link.characterId)
    map.set(link.storyboardId, arr)
  }
  return map
}

async function collectGridReferenceAssets(
  storyboards: GridStoryboardsRow[],
  storyboardCharacterIds: Map<number, number[]>,
) {
  const sceneIds = [...new Set(storyboards.map((sb) => sb.sceneId).filter(Boolean))]
  const characterIds = [...new Set([...storyboardCharacterIds.values()].flat().filter(Boolean))]

  const scenes = sceneIds.length
    ? (await db.select().from(schema.scenes).all()).filter((scene) => sceneIds.includes(scene.id))
    : []
  const characters = characterIds.length
    ? (await db.select().from(schema.characters).all()).filter((char) => characterIds.includes(char.id))
    : []

  const assets: Array<{
    path: string
    label: string
    kind: 'scene' | 'character' | 'storyboard'
    sceneId?: number
    characterId?: number
    storyboardId?: number
  }> = []
  const seen = new Set<string>()
  const pushAsset = (
    path: string | null | undefined,
    label: string,
    kind: 'scene' | 'character' | 'storyboard',
    extra: { sceneId?: number; characterId?: number; storyboardId?: number } = {},
  ) => {
    if (!path || seen.has(path) || assets.length >= 6) return
    seen.add(path)
    assets.push({ path, label, kind, ...extra })
  }

  for (const sb of storyboards) {
    pushAsset(sb.firstFrameImage, `镜头${sb.storyboardNumber}首帧`, 'storyboard', { storyboardId: sb.id })
    pushAsset(sb.lastFrameImage, `镜头${sb.storyboardNumber}尾帧`, 'storyboard', { storyboardId: sb.id })
    pushAsset(sb.composedImage, `镜头${sb.storyboardNumber}镜头图`, 'storyboard', { storyboardId: sb.id })
    for (const ref of parseGridJsonArray(sb.referenceImages)) {
      pushAsset(ref, `镜头${sb.storyboardNumber}参考图`, 'storyboard', { storyboardId: sb.id })
    }
  }
  for (const scene of scenes) {
    pushAsset(scene.imageUrl, `${scene.location}${scene.time ? `（${scene.time}）` : ''}场景`, 'scene', { sceneId: scene.id })
  }
  for (const char of characters) {
    pushAsset(char.imageUrl, `${char.name}角色`, 'character', { characterId: char.id })
  }

  return assets.map((asset, index) => ({
    ...asset,
    imageIndex: index + 1,
    imageLabel: `图片${index + 1}`,
  }))
}

async function tryAgentGridPrompt(
  episodeId: number,
  dramaId: number,
  storyboardIds: number[],
  rows: number,
  cols: number,
  mode: string,
  referenceLegend: string,
) {
  const agent = await createAgent('grid_prompt_generator', episodeId, dramaId)
  if (!agent) return null

  const result = await agent.generate(
    [{
      role: 'user',
      content: [
        '请为宫格图生成提示词，并优先调用工具完成。',
        `选中镜头ID：${JSON.stringify(storyboardIds)}`,
        `行数：${rows}`,
        `列数：${cols}`,
        `模式：${mode}`,
        referenceLegend ? `参考图映射：${referenceLegend}` : '',
        '当提示词涉及到某个角色或场景时，直接把对应的图片编号写进提示词，例如：图片1中的角色A站了起来，图片3中的房间场景。不要只写名字，不写图片编号。',
        `必须严格按 ${rows}x${cols} 生成，总共 exactly ${rows * cols} visible panels。不要合并格子，不要缺格。`,
        '必须返回 JSON，结构为：{"grid_prompt":"...","cell_prompts":[{"shot_number":1,"frame_type":"first_frame","prompt":"..."}]}',
      ].join('\n'),
    }],
    { maxSteps: 10 },
  )

  const fromTools = findGridPayload(result.toolResults)
  if (fromTools) return fromTools

  const fromText = findGridPayload(result.text)
  if (fromText) return fromText

  return null
}

// POST /grid/prompt
app.post('/prompt', async (c) => {
  const currentUser = getCurrentUser(c)
  const body = await readJsonBody(c)
  const storyboardIds = Array.isArray(body.storyboard_ids)
    ? body.storyboard_ids.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
    : []
  const dramaId = readBodyNumber(body, 'drama_id')
  const episodeId = readBodyNumber(body, 'episode_id')
  const rows = readBodyNumber(body, 'rows')
  const cols = readBodyNumber(body, 'cols')
  const mode = typeof body.mode === 'string' ? body.mode : 'first_frame'

  if (!storyboardIds.length) return badRequest(c, 'storyboard_ids required')
  if (!rows || !cols) return badRequest(c, 'rows and cols required')
  if (dramaId && !await findOwnedDrama(currentUser.id, dramaId)) return badRequest(c, 'Drama not found')
  for (const storyboardId of storyboardIds) {
    if (!await findOwnedStoryboard(currentUser.id, storyboardId)) return badRequest(c, 'Storyboard not found')
  }

  const storyboards = (await Promise.all(storyboardIds.map(async (id: number) => {
    const [sb] = (await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, id)).all())
    return sb
  }))).filter((sb): sb is GridStoryboardsRow => Boolean(sb))

  if (!storyboards.length) return badRequest(c, 'No storyboards found')

  let dramaStyle = ''
  if (dramaId) {
    const [drama] = (await db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId)).all())
    dramaStyle = drama?.style || ''
  }

  const actualCols = cols
  const actualRows = rows
  const resolvedEpisodeId = Number(episodeId || storyboards[0]?.episodeId || 0)
  const storyboardCharacterIds = await getStoryboardCharacterIds(storyboardIds)
  const referenceAssets = await collectGridReferenceAssets(storyboards, storyboardCharacterIds)
  const referenceLegend = buildReferenceLegend(referenceAssets)

  if (!resolvedEpisodeId) {
    return badRequest(c, 'episode_id required')
  }

  try {
    const agentPayload = await tryAgentGridPrompt(
      resolvedEpisodeId,
      Number(dramaId || 0),
      storyboardIds,
      actualRows,
      actualCols,
      mode,
      referenceLegend,
    )

    if (agentPayload?.grid_prompt) {
      logTaskProgress('GridPrompt', 'agent-success', {
        episodeId: resolvedEpisodeId,
        dramaId,
        mode,
        rows: actualRows,
        cols: actualCols,
        storyboardCount: storyboardIds.length,
      })
      logTaskPayload('GridPrompt', 'agent-result', agentPayload)
      return success(c, {
        ...agentPayload,
        source: 'agent',
        grid: { rows: actualRows, cols: actualCols },
        storyboard_ids: storyboardIds,
        mode,
      })
    }
  } catch (error: unknown) {
    logTaskError('GridPrompt', 'agent-failed', {
      episodeId: resolvedEpisodeId,
      dramaId,
      error: errorMessageFromUnknown(error, 'Grid prompt generation failed'),
    })
  }

  const gridPrompt = buildGridPrompt(
    mode,
    storyboards,
    actualRows,
    actualCols,
    dramaStyle,
    referenceAssets,
    storyboardCharacterIds,
  )
  const cellPrompts = buildGridCellPrompts(
    mode,
    storyboards,
    actualRows,
    actualCols,
    referenceAssets,
    storyboardCharacterIds,
  )
  logTaskProgress('GridPrompt', 'fallback-used', {
    episodeId: resolvedEpisodeId,
    dramaId,
    mode,
    rows: actualRows,
    cols: actualCols,
    storyboardCount: storyboardIds.length,
  })

  return success(c, {
    grid_prompt: gridPrompt,
    cell_prompts: cellPrompts,
    source: 'fallback',
    grid: { rows: actualRows, cols: actualCols },
    storyboard_ids: storyboardIds,
    mode,
  })
})

// POST /grid/generate
app.post('/generate', async (c) => {
  const currentUser = getCurrentUser(c)
  const body = await readJsonBody(c)
  const storyboardIds = Array.isArray(body.storyboard_ids)
    ? body.storyboard_ids.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
    : []
  const dramaId = readBodyNumber(body, 'drama_id')
  const rows = readBodyNumber(body, 'rows')
  const cols = readBodyNumber(body, 'cols')
  const mode = typeof body.mode === 'string' ? body.mode : 'first_frame'
  const customPrompt = typeof body.custom_prompt === 'string' ? body.custom_prompt : undefined

  if (!storyboardIds.length) return badRequest(c, 'storyboard_ids required')
  if (!rows || !cols) return badRequest(c, 'rows and cols required')
  if (dramaId && !await findOwnedDrama(currentUser.id, dramaId)) return badRequest(c, 'Drama not found')
  for (const storyboardId of storyboardIds) {
    if (!await findOwnedStoryboard(currentUser.id, storyboardId)) return badRequest(c, 'Storyboard not found')
  }

  const storyboards = (await Promise.all(storyboardIds.map(async (id: number) => {
    const [sb] = (await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, id)).all())
    return sb
  }))).filter((sb): sb is GridStoryboardsRow => Boolean(sb))

  if (!storyboards.length) return badRequest(c, 'No storyboards found')

  // Get drama style
  let dramaStyle = ''
  if (dramaId) {
    const [drama] = (await db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId)).all())
    dramaStyle = drama?.style || ''
  }

  const storyboardCharacterIds = await getStoryboardCharacterIds(storyboardIds)
  const referenceAssets = await collectGridReferenceAssets(storyboards, storyboardCharacterIds)
  const prompt = customPrompt || buildGridPrompt(
    mode,
    storyboards,
    rows,
    cols,
    dramaStyle,
    referenceAssets,
    storyboardCharacterIds,
  )
  const referenceImages = referenceAssets.map((asset) => asset.path)

  // Size: first_last mode uses Nx2 layout
  const cellW = 960, cellH = 540
  const actualCols = cols
  const actualRows = rows
  const size = `${cellW * actualCols}x${cellH * actualRows}`

  try {
    const genId = await generateImage({
      dramaId,
      prompt,
      size,
      frameType: `grid_${mode}_${actualRows}x${actualCols}`,
      referenceImages,
    })

    logTaskProgress('GridGenerate', 'reference-images', {
      dramaId,
      mode,
      rows: actualRows,
      cols: actualCols,
      referenceCount: referenceImages.length,
    })

    return success(c, {
      image_generation_id: genId,
      grid: { rows: actualRows, cols: actualCols },
      mode,
      storyboard_ids: storyboardIds,
      prompt,
      reference_images: referenceImages,
    })
  } catch (error: unknown) {
    return badRequest(c, errorMessageFromUnknown(error, 'Grid generation failed'))
  }
})

// POST /grid/split
app.post('/split', async (c) => {
  const currentUser = getCurrentUser(c)
  const body = await readJsonBody(c)
  const imageGenerationId = readBodyNumber(body, 'image_generation_id')
  const rows = readBodyNumber(body, 'rows')
  const cols = readBodyNumber(body, 'cols')
  const assignments = normalizeGridAssignments(readBodyObjectArray(body, 'assignments'))

  if (!imageGenerationId) return badRequest(c, 'image_generation_id required')
  if (!rows || !cols) return badRequest(c, 'rows and cols required')
  if (!assignments.length) return badRequest(c, 'assignments required')
  if (!await findOwnedImageGeneration(currentUser.id, imageGenerationId)) return badRequest(c, 'Image generation not found')
  for (const assignment of assignments) {
    if (!await findOwnedStoryboard(currentUser.id, assignment.storyboardId)) return badRequest(c, 'Storyboard not found')
  }

  const [imgRecord] = (await db.select().from(schema.imageGenerations)
    .where(eq(schema.imageGenerations.id, imageGenerationId)).all())

  if (!imgRecord) return badRequest(c, 'Image generation not found')
  if (imgRecord.status !== 'completed') return badRequest(c, `Image status: ${imgRecord.status}`)
  if (!imgRecord.localPath) return badRequest(c, 'No local image file')

  try {
    const cells = await splitGridImage(imgRecord.localPath, rows, cols)

    const results: Array<{
      storyboardId: number
      frameType: string
      localPath: string
      publicUrl: string
    }> = []
    for (let i = 0; i < assignments.length && i < cells.length; i++) {
      const assignment = assignments[i]
      const storyboardId = assignment.storyboardId
      const frameType = assignment.frameType
      const cell = cells[i]
      if (!storyboardId || !frameType) continue
      const publicPath = await uploadStaticAssetToCos(cell.localPath) || cell.localPath

      const update: {
        updatedAt: string
        firstFrameImage?: string
        lastFrameImage?: string
        referenceImages?: string
      } = { updatedAt: now() }
      if (frameType === 'first_frame') update.firstFrameImage = publicPath
      else if (frameType === 'last_frame') update.lastFrameImage = publicPath
      else if (frameType === 'reference') {
        const [sb] = (await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all())
        const existing = parseGridJsonArray(sb?.referenceImages).slice()
        existing.push(publicPath)
        update.referenceImages = JSON.stringify(existing)
      }

      await db.update(schema.storyboards).set(update).where(eq(schema.storyboards.id, storyboardId)).run()
      results.push({ storyboardId, frameType, localPath: cell.localPath, publicUrl: publicPath })
    }

    return success(c, {
      cells: results.map((cell) => ({
        storyboard_id: cell.storyboardId,
        frame_type: cell.frameType,
        local_path: cell.localPath,
        public_url: cell.publicUrl,
      })),
    })
  } catch (error: unknown) {
    return badRequest(c, errorMessageFromUnknown(error, 'Grid split failed'))
  }
})

// GET /grid/status/:id
app.get('/status/:id', async (c) => {
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const row = await findOwnedImageGeneration(currentUser.id, id)
  if (!row) return badRequest(c, 'Not found')
  const asset = presentImageGenerationAsset(row)
  return success(c, {
    id: row.id,
    status: row.status,
    local_path: asset.local_path || row.localPath,
    image_url: asset.image_url || row.imageUrl,
    minio_url: asset.minio_url || row.minioUrl,
    error_msg: row.errorMsg,
  })
})

export default app
