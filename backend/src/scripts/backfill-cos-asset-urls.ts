import { backfillPersistedAssetUrls } from '../db/asset-url-backfill.js'
import { ensureDatabaseReady, mysqlPool } from '../db/index.js'

try {
  await ensureDatabaseReady()
  const results = await backfillPersistedAssetUrls(mysqlPool)
  console.log(JSON.stringify({ ok: true, results }, null, 2))
} finally {
  await mysqlPool.end()
}
