import type { Pool, ResultSetHeader } from 'mysql2/promise'

type BackfillStep = {
  name: string
  sql: string
  params?: unknown[]
}

const completedImageWithCos = "status = 'completed' AND minio_url IS NOT NULL AND minio_url <> ''"
const completedVideoWithCos = "status = 'completed' AND minio_url IS NOT NULL AND minio_url <> ''"

function latestImageJoin(
  ownerColumn: 'character_id' | 'scene_id' | 'storyboard_id',
  frameCondition = '',
) {
  return `
    SELECT ig.${ownerColumn}, ig.minio_url
      FROM image_generations ig
      JOIN (
        SELECT ${ownerColumn}, MAX(id) AS id
          FROM image_generations
         WHERE ${ownerColumn} IS NOT NULL
           AND status = 'completed'
           AND minio_url IS NOT NULL
           AND minio_url <> ''
           ${frameCondition}
         GROUP BY ${ownerColumn}
      ) latest ON latest.id = ig.id
  `
}

function latestVideoJoin() {
  return `
    SELECT vg.storyboard_id, vg.minio_url
      FROM video_generations vg
      JOIN (
        SELECT storyboard_id, MAX(id) AS id
          FROM video_generations
         WHERE storyboard_id IS NOT NULL
           AND status = 'completed'
           AND minio_url IS NOT NULL
           AND minio_url <> ''
         GROUP BY storyboard_id
      ) latest ON latest.id = vg.id
  `
}

export function buildAssetUrlBackfillSteps(now = new Date().toISOString()): BackfillStep[] {
  return [
    {
      name: 'image_generations.image_url',
      sql: `
        UPDATE image_generations
           SET image_url = minio_url,
               updated_at = ?
         WHERE ${completedImageWithCos}
           AND (image_url IS NULL OR image_url = '' OR image_url <> minio_url)
      `,
      params: [now],
    },
    {
      name: 'video_generations.video_url',
      sql: `
        UPDATE video_generations
           SET video_url = minio_url,
               updated_at = ?
         WHERE ${completedVideoWithCos}
           AND (video_url IS NULL OR video_url = '' OR video_url <> minio_url)
      `,
      params: [now],
    },
    {
      name: 'characters.image_url',
      sql: `
        UPDATE characters c
        JOIN (${latestImageJoin('character_id')}) latest ON latest.character_id = c.id
           SET c.image_url = latest.minio_url,
               c.updated_at = ?
         WHERE c.image_url IS NULL OR c.image_url = '' OR c.image_url <> latest.minio_url
      `,
      params: [now],
    },
    {
      name: 'scenes.image_url',
      sql: `
        UPDATE scenes s
        JOIN (${latestImageJoin('scene_id')}) latest ON latest.scene_id = s.id
           SET s.image_url = latest.minio_url,
               s.updated_at = ?
         WHERE s.image_url IS NULL OR s.image_url = '' OR s.image_url <> latest.minio_url
      `,
      params: [now],
    },
    {
      name: 'storyboards.first_frame_image',
      sql: `
        UPDATE storyboards s
        JOIN (${latestImageJoin('storyboard_id', "AND frame_type = 'first_frame'")}) latest ON latest.storyboard_id = s.id
           SET s.first_frame_image = latest.minio_url,
               s.updated_at = ?
         WHERE s.first_frame_image IS NULL OR s.first_frame_image = '' OR s.first_frame_image <> latest.minio_url
      `,
      params: [now],
    },
    {
      name: 'storyboards.last_frame_image',
      sql: `
        UPDATE storyboards s
        JOIN (${latestImageJoin('storyboard_id', "AND frame_type = 'last_frame'")}) latest ON latest.storyboard_id = s.id
           SET s.last_frame_image = latest.minio_url,
               s.updated_at = ?
         WHERE s.last_frame_image IS NULL OR s.last_frame_image = '' OR s.last_frame_image <> latest.minio_url
      `,
      params: [now],
    },
    {
      name: 'storyboards.composed_image',
      sql: `
        UPDATE storyboards s
        JOIN (${latestImageJoin('storyboard_id', "AND (frame_type IS NULL OR frame_type = '' OR frame_type NOT IN ('first_frame', 'last_frame'))")}) latest ON latest.storyboard_id = s.id
           SET s.composed_image = latest.minio_url,
               s.updated_at = ?
         WHERE s.composed_image IS NULL OR s.composed_image = '' OR s.composed_image <> latest.minio_url
      `,
      params: [now],
    },
    {
      name: 'storyboards.video_url',
      sql: `
        UPDATE storyboards s
        JOIN (${latestVideoJoin()}) latest ON latest.storyboard_id = s.id
           SET s.video_url = latest.minio_url,
               s.updated_at = ?
         WHERE s.video_url IS NULL OR s.video_url = '' OR s.video_url <> latest.minio_url
      `,
      params: [now],
    },
  ]
}

export function buildAssetUrlBackfillCheckQuery(): string {
  const checks = [
    {
      name: 'image_generations.image_url',
      sql: `
        SELECT 'image_generations.image_url' AS name, COUNT(*) AS remaining
          FROM image_generations
         WHERE ${completedImageWithCos}
           AND (image_url IS NULL OR image_url = '' OR image_url <> minio_url)
      `,
    },
    {
      name: 'video_generations.video_url',
      sql: `
        SELECT 'video_generations.video_url' AS name, COUNT(*) AS remaining
          FROM video_generations
         WHERE ${completedVideoWithCos}
           AND (video_url IS NULL OR video_url = '' OR video_url <> minio_url)
      `,
    },
    {
      name: 'characters.image_url',
      sql: `
        SELECT 'characters.image_url' AS name, COUNT(*) AS remaining
          FROM characters c
          JOIN (${latestImageJoin('character_id')}) latest ON latest.character_id = c.id
         WHERE c.image_url IS NULL OR c.image_url = '' OR c.image_url <> latest.minio_url
      `,
    },
    {
      name: 'scenes.image_url',
      sql: `
        SELECT 'scenes.image_url' AS name, COUNT(*) AS remaining
          FROM scenes s
          JOIN (${latestImageJoin('scene_id')}) latest ON latest.scene_id = s.id
         WHERE s.image_url IS NULL OR s.image_url = '' OR s.image_url <> latest.minio_url
      `,
    },
    {
      name: 'storyboards.first_frame_image',
      sql: `
        SELECT 'storyboards.first_frame_image' AS name, COUNT(*) AS remaining
          FROM storyboards s
          JOIN (${latestImageJoin('storyboard_id', "AND frame_type = 'first_frame'")}) latest ON latest.storyboard_id = s.id
         WHERE s.first_frame_image IS NULL OR s.first_frame_image = '' OR s.first_frame_image <> latest.minio_url
      `,
    },
    {
      name: 'storyboards.last_frame_image',
      sql: `
        SELECT 'storyboards.last_frame_image' AS name, COUNT(*) AS remaining
          FROM storyboards s
          JOIN (${latestImageJoin('storyboard_id', "AND frame_type = 'last_frame'")}) latest ON latest.storyboard_id = s.id
         WHERE s.last_frame_image IS NULL OR s.last_frame_image = '' OR s.last_frame_image <> latest.minio_url
      `,
    },
    {
      name: 'storyboards.composed_image',
      sql: `
        SELECT 'storyboards.composed_image' AS name, COUNT(*) AS remaining
          FROM storyboards s
          JOIN (${latestImageJoin('storyboard_id', "AND (frame_type IS NULL OR frame_type = '' OR frame_type NOT IN ('first_frame', 'last_frame'))")}) latest ON latest.storyboard_id = s.id
         WHERE s.composed_image IS NULL OR s.composed_image = '' OR s.composed_image <> latest.minio_url
      `,
    },
    {
      name: 'storyboards.video_url',
      sql: `
        SELECT 'storyboards.video_url' AS name, COUNT(*) AS remaining
          FROM storyboards s
          JOIN (${latestVideoJoin()}) latest ON latest.storyboard_id = s.id
         WHERE s.video_url IS NULL OR s.video_url = '' OR s.video_url <> latest.minio_url
      `,
    },
  ]

  const expectedNames = buildAssetUrlBackfillSteps('').map(step => step.name)
  const checkNames = checks.map(check => check.name)
  if (expectedNames.join('\n') !== checkNames.join('\n')) {
    throw new Error('Asset URL backfill checks are out of sync with update steps')
  }

  return checks.map(check => check.sql.trim()).join('\nUNION ALL\n')
}

export async function backfillPersistedAssetUrls(pool: Pool) {
  const results: Array<{ name: string; affectedRows: number }> = []
  for (const step of buildAssetUrlBackfillSteps()) {
    const [result] = await pool.query<ResultSetHeader>(step.sql, step.params || [])
    results.push({ name: step.name, affectedRows: Number(result.affectedRows || 0) })
  }
  return results
}
