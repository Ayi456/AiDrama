import { mysqlPool } from '../db/index.js'

const [rows] = await mysqlPool.query(`
  SELECT 'image_generations.image_url' AS name, COUNT(*) AS remaining
    FROM image_generations
   WHERE status = 'completed'
     AND minio_url IS NOT NULL
     AND minio_url <> ''
     AND (image_url IS NULL OR image_url = '' OR image_url <> minio_url)
  UNION ALL
  SELECT 'video_generations.video_url' AS name, COUNT(*) AS remaining
    FROM video_generations
   WHERE status = 'completed'
     AND minio_url IS NOT NULL
     AND minio_url <> ''
     AND (video_url IS NULL OR video_url = '' OR video_url <> minio_url)
  UNION ALL
  SELECT 'characters.image_url' AS name, COUNT(*) AS remaining
    FROM characters c
    JOIN (
      SELECT ig.character_id, ig.minio_url
        FROM image_generations ig
        JOIN (
          SELECT character_id, MAX(id) AS id
            FROM image_generations
           WHERE character_id IS NOT NULL
             AND status = 'completed'
             AND minio_url IS NOT NULL
             AND minio_url <> ''
           GROUP BY character_id
        ) latest ON latest.id = ig.id
    ) latest ON latest.character_id = c.id
   WHERE c.image_url IS NULL OR c.image_url = '' OR c.image_url <> latest.minio_url
  UNION ALL
  SELECT 'scenes.image_url' AS name, COUNT(*) AS remaining
    FROM scenes s
    JOIN (
      SELECT ig.scene_id, ig.minio_url
        FROM image_generations ig
        JOIN (
          SELECT scene_id, MAX(id) AS id
            FROM image_generations
           WHERE scene_id IS NOT NULL
             AND status = 'completed'
             AND minio_url IS NOT NULL
             AND minio_url <> ''
           GROUP BY scene_id
        ) latest ON latest.id = ig.id
    ) latest ON latest.scene_id = s.id
   WHERE s.image_url IS NULL OR s.image_url = '' OR s.image_url <> latest.minio_url
  UNION ALL
  SELECT 'storyboards.first_frame_image' AS name, COUNT(*) AS remaining
    FROM storyboards s
    JOIN (
      SELECT ig.storyboard_id, ig.minio_url
        FROM image_generations ig
        JOIN (
          SELECT storyboard_id, MAX(id) AS id
            FROM image_generations
           WHERE storyboard_id IS NOT NULL
             AND frame_type = 'first_frame'
             AND status = 'completed'
             AND minio_url IS NOT NULL
             AND minio_url <> ''
           GROUP BY storyboard_id
        ) latest ON latest.id = ig.id
    ) latest ON latest.storyboard_id = s.id
   WHERE s.first_frame_image IS NULL OR s.first_frame_image = '' OR s.first_frame_image <> latest.minio_url
  UNION ALL
  SELECT 'storyboards.last_frame_image' AS name, COUNT(*) AS remaining
    FROM storyboards s
    JOIN (
      SELECT ig.storyboard_id, ig.minio_url
        FROM image_generations ig
        JOIN (
          SELECT storyboard_id, MAX(id) AS id
            FROM image_generations
           WHERE storyboard_id IS NOT NULL
             AND frame_type = 'last_frame'
             AND status = 'completed'
             AND minio_url IS NOT NULL
             AND minio_url <> ''
           GROUP BY storyboard_id
        ) latest ON latest.id = ig.id
    ) latest ON latest.storyboard_id = s.id
   WHERE s.last_frame_image IS NULL OR s.last_frame_image = '' OR s.last_frame_image <> latest.minio_url
  UNION ALL
  SELECT 'storyboards.composed_image' AS name, COUNT(*) AS remaining
    FROM storyboards s
    JOIN (
      SELECT ig.storyboard_id, ig.minio_url
        FROM image_generations ig
        JOIN (
          SELECT storyboard_id, MAX(id) AS id
            FROM image_generations
           WHERE storyboard_id IS NOT NULL
             AND (frame_type IS NULL OR frame_type = '' OR frame_type NOT IN ('first_frame', 'last_frame'))
             AND status = 'completed'
             AND minio_url IS NOT NULL
             AND minio_url <> ''
           GROUP BY storyboard_id
        ) latest ON latest.id = ig.id
    ) latest ON latest.storyboard_id = s.id
   WHERE s.composed_image IS NULL OR s.composed_image = '' OR s.composed_image <> latest.minio_url
  UNION ALL
  SELECT 'storyboards.video_url' AS name, COUNT(*) AS remaining
    FROM storyboards s
    JOIN (
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
    ) latest ON latest.storyboard_id = s.id
   WHERE s.video_url IS NULL OR s.video_url = '' OR s.video_url <> latest.minio_url
`)

console.log(JSON.stringify({ ok: true, results: rows }, null, 2))
await mysqlPool.end()
