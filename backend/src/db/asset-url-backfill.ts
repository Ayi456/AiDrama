import type { Pool, ResultSetHeader } from 'mysql2/promise'

type BackfillStep = {
  name: string
  sql: string
  params?: unknown[]
}

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
  const completedImageWithCos = "status = 'completed' AND minio_url IS NOT NULL AND minio_url <> ''"
  const completedVideoWithCos = "status = 'completed' AND minio_url IS NOT NULL AND minio_url <> ''"

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

export async function backfillPersistedAssetUrls(pool: Pool) {
  const results: Array<{ name: string; affectedRows: number }> = []
  for (const step of buildAssetUrlBackfillSteps()) {
    const [result] = await pool.query<ResultSetHeader>(step.sql, step.params || [])
    results.push({ name: step.name, affectedRows: Number(result.affectedRows || 0) })
  }
  return results
}
