import mysql, { type PoolOptions } from 'mysql2/promise'

import { backfillPersistedAssetUrls } from './asset-url-backfill.js'
import { DEFAULT_DB_NAME, identifier, mysqlConfig } from './config.js'
import { runAdditiveMigrations } from './migrations.js'
import { mysqlPool } from './runtime.js'
import { tableStatements } from './table-statements.js'

async function ensureDatabaseExists(config: PoolOptions) {
  const database = String(config.database || DEFAULT_DB_NAME)
  const bootstrapPool = mysql.createPool({
    ...config,
    database: undefined,
    waitForConnections: true,
    connectionLimit: 1,
  })

  try {
    await bootstrapPool.query(
      `CREATE DATABASE IF NOT EXISTS ${identifier(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    )
  } catch {
    // Some managed MySQL accounts cannot create databases. The normal pool
    // connection will still succeed when the database already exists.
  } finally {
    await bootstrapPool.end()
  }
}

async function bootstrapDatabase() {
  await ensureDatabaseExists(mysqlConfig)
  for (const statement of tableStatements) {
    await mysqlPool.query(statement)
  }
  await runAdditiveMigrations(mysqlPool, String(mysqlConfig.database || DEFAULT_DB_NAME))

  try {
    const results = await backfillPersistedAssetUrls(mysqlPool)
    const changed = results.filter(result => result.affectedRows > 0)
    if (changed.length) {
      console.log(`[DB] Backfilled COS asset URLs: ${changed.map(result => `${result.name}=${result.affectedRows}`).join(', ')}`)
    }
  } catch (error) {
    console.warn('[DB] Failed to backfill COS asset URLs:', error)
  }
}

export function createIdempotentInitializer(initialize: () => Promise<void>) {
  let readiness: Promise<void> | null = null
  return () => {
    if (!readiness) {
      readiness = initialize().catch((error) => {
        readiness = null
        throw error
      })
    }
    return readiness
  }
}

export const ensureDatabaseReady = createIdempotentInitializer(bootstrapDatabase)
