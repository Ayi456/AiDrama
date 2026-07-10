import mysql, { type Pool, type PoolOptions } from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import * as schema from './schema.js'
import { eq } from 'drizzle-orm'
import { backfillPersistedAssetUrls } from './asset-url-backfill.js'
import { installQueryExecutionHelpers } from './query-helpers.js'
import { DEFAULT_DB_NAME, identifier, mysqlConfig } from './config.js'
import { runAdditiveMigrations } from './migrations.js'
import { tableStatements } from './table-statements.js'

async function ensureDatabaseExists(config: PoolOptions) {
  const database = String(config.database || DEFAULT_DB_NAME)
  const bootstrap = mysql.createPool({
    ...config,
    database: undefined,
    waitForConnections: true,
    connectionLimit: 1,
  })

  try {
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS ${identifier(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    )
  } catch {
    // Some managed MySQL accounts cannot create databases. The normal pool
    // connection below will still succeed when the database already exists.
  } finally {
    await bootstrap.end()
  }
}

async function initializeDatabase(pool: Pool, database: string) {
  for (const statement of tableStatements) {
    await pool.query(statement)
  }
  await runAdditiveMigrations(pool, database)
}

await ensureDatabaseExists(mysqlConfig)

export const mysqlPool = mysql.createPool(mysqlConfig)
await initializeDatabase(mysqlPool, String(mysqlConfig.database || DEFAULT_DB_NAME))
try {
  const assetBackfillResults = await backfillPersistedAssetUrls(mysqlPool)
  const changed = assetBackfillResults.filter(result => result.affectedRows > 0)
  if (changed.length) {
    console.log(`[DB] Backfilled COS asset URLs: ${changed.map(result => `${result.name}=${result.affectedRows}`).join(', ')}`)
  }
} catch (error) {
  console.warn('[DB] Failed to backfill COS asset URLs:', error)
}

const mysqlDb = drizzle(mysqlPool, { schema, mode: 'default' })

installQueryExecutionHelpers(mysqlDb.select().from(schema.dramas))
installQueryExecutionHelpers(mysqlDb.insert(schema.dramas).values({ title: '', createdAt: '', updatedAt: '' }))
installQueryExecutionHelpers(mysqlDb.update(schema.dramas).set({ updatedAt: '' }).where(eq(schema.dramas.id, 0)))
installQueryExecutionHelpers(mysqlDb.delete(schema.dramas).where(eq(schema.dramas.id, 0)))

export const db = mysqlDb
export { schema }
export type DB = typeof db
