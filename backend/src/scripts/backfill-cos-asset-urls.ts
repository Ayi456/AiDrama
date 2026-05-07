import { backfillPersistedAssetUrls } from '../db/asset-url-backfill.js'
import { mysqlPool } from '../db/index.js'

try {
  const results = await backfillPersistedAssetUrls(mysqlPool)
  console.log(JSON.stringify({ ok: true, results }, null, 2))
} finally {
  await mysqlPool.end()
}
