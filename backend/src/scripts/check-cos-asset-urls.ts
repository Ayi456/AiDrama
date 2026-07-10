import { ensureDatabaseReady, mysqlPool } from '../db/index.js'
import { buildAssetUrlBackfillCheckQuery } from '../db/asset-url-backfill.js'

await ensureDatabaseReady()
const [rows] = await mysqlPool.query(buildAssetUrlBackfillCheckQuery())

console.log(JSON.stringify({ ok: true, results: rows }, null, 2))
await mysqlPool.end()
