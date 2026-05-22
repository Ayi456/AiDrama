import mysql, { type Pool, type PoolOptions, type RowDataPacket } from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import * as schema from './schema.js'
import { eq } from 'drizzle-orm'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { backfillPersistedAssetUrls } from './asset-url-backfill.js'
import { installQueryExecutionHelpers } from './query-helpers.js'
import { ensureProjectEnvLoaded, parseLooseEnvFile } from '../utils/project-env.js'

ensureProjectEnvLoaded()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../../..')
const DEFAULT_DB_NAME = 'AiDrama'

const looseEnv = parseLooseEnvFile(path.join(PROJECT_ROOT, '.env'))

function envValue(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key] ?? looseEnv[key]
    if (value != null && String(value).trim()) return String(value).trim()
  }
  return ''
}

function numberEnv(defaultValue: number, ...keys: string[]) {
  const raw = envValue(...keys)
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

function identifier(value: string) {
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(`Invalid MySQL identifier: ${value}`)
  }
  return `\`${value}\``
}

function getMysqlConfig(): PoolOptions {
  const databaseUrl = envValue('DATABASE_URL', 'MYSQL_URL')
  if (databaseUrl) {
    const url = new URL(databaseUrl)
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\/+/, '')) || DEFAULT_DB_NAME,
      waitForConnections: true,
      connectionLimit: numberEnv(10, 'DB_CONNECTION_LIMIT', 'MYSQL_CONNECTION_LIMIT'),
      charset: 'utf8mb4',
    }
  }

  const host = envValue('DB_HOST', 'MYSQL_HOST', '主机')
  const user = envValue('DB_USER', 'MYSQL_USER', '用户名')
  const password = envValue('DB_PASSWORD', 'MYSQL_PASSWORD', '密码')
  const database = envValue('DB_NAME', 'MYSQL_DATABASE', 'DATABASE_NAME', '数据库') || DEFAULT_DB_NAME

  const missing = [
    !host && 'DB_HOST',
    !user && 'DB_USER',
  ].filter(Boolean)
  if (missing.length) {
    throw new Error(`Missing MySQL database config: ${missing.join(', ')}`)
  }

  return {
    host,
    port: numberEnv(3306, 'DB_PORT', 'MYSQL_PORT', '端口'),
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: numberEnv(10, 'DB_CONNECTION_LIMIT', 'MYSQL_CONNECTION_LIMIT'),
    charset: 'utf8mb4',
  }
}

const mysqlConfig = getMysqlConfig()

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

const tableStatements = [
  `CREATE TABLE IF NOT EXISTS dramas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    genre TEXT,
    style VARCHAR(64) DEFAULT 'realistic',
    total_episodes INT DEFAULT 1,
    total_duration INT DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    thumbnail TEXT,
    tags TEXT,
    metadata TEXT,
    image_config_id INT,
    video_config_id INT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS episodes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    drama_id INT NOT NULL,
    episode_number INT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    script_content TEXT,
    description TEXT,
    duration INT DEFAULT 0,
    status VARCHAR(32) DEFAULT 'draft',
    video_url TEXT,
    thumbnail TEXT,
    image_config_id INT,
    video_config_id INT,
    transition_type VARCHAR(32),
    transition_duration_ms INT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS characters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    drama_id INT NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    description TEXT,
    appearance TEXT,
    personality TEXT,
    image_prompt TEXT,
    image_url TEXT,
    reference_images TEXT,
    character_asset_id INT,
    seed_value TEXT,
    sort_order INT,
    local_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS character_assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name TEXT NOT NULL,
    gender VARCHAR(32) DEFAULT 'unknown',
    role_preset VARCHAR(64) DEFAULT 'custom',
    image_url TEXT NOT NULL,
    local_path TEXT,
    description TEXT,
    appearance TEXT,
    tags TEXT,
    is_default TINYINT(1) DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS scenes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    drama_id INT NOT NULL,
    episode_id INT,
    location TEXT NOT NULL,
    time TEXT NOT NULL,
    prompt TEXT NOT NULL,
    storyboard_count INT DEFAULT 1,
    image_url TEXT,
    reference_image TEXT,
    status VARCHAR(32) DEFAULT 'pending',
    local_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS storyboards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    episode_id INT NOT NULL,
    scene_id INT,
    storyboard_number INT NOT NULL,
    title TEXT,
    location TEXT,
    time TEXT,
    shot_type TEXT,
    angle TEXT,
    movement TEXT,
    action TEXT,
    result TEXT,
    atmosphere TEXT,
    image_prompt TEXT,
    video_prompt TEXT,
    bgm_prompt TEXT,
    sound_effect TEXT,
    dialogue TEXT,
    description TEXT,
    duration INT DEFAULT 0,
    composed_image TEXT,
    first_frame_image TEXT,
    last_frame_image TEXT,
    reference_images TEXT,
    video_url TEXT,
    tts_audio_url TEXT,
    subtitle_url TEXT,
    composed_video_url TEXT,
    status VARCHAR(32) DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS episode_characters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    episode_id INT NOT NULL,
    character_id INT NOT NULL,
    created_at TEXT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS episode_scenes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    episode_id INT NOT NULL,
    scene_id INT NOT NULL,
    created_at TEXT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS storyboard_characters (
    storyboard_id INT NOT NULL,
    character_id INT NOT NULL,
    PRIMARY KEY (storyboard_id, character_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ai_service_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    service_type TEXT NOT NULL,
    provider TEXT,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    model TEXT,
    endpoint TEXT,
    query_endpoint TEXT,
    priority INT DEFAULT 0,
    is_default TINYINT(1) DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    settings TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ai_service_providers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name TEXT NOT NULL,
    display_name TEXT,
    service_type TEXT NOT NULL,
    provider TEXT NOT NULL,
    default_url TEXT,
    preset_models TEXT,
    description TEXT,
    is_active TINYINT(1) DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS agent_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agent_type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    model TEXT,
    system_prompt TEXT,
    temperature DOUBLE,
    max_tokens INT,
    max_iterations INT,
    is_active TINYINT(1) DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS image_generations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    storyboard_id INT,
    drama_id INT,
    scene_id INT,
    character_id INT,
    prop_id INT,
    image_type TEXT,
    frame_type TEXT,
    provider TEXT,
    prompt TEXT,
    negative_prompt TEXT,
    model TEXT,
    size TEXT,
    quality TEXT,
    style TEXT,
    steps INT,
    cfg_scale DOUBLE,
    seed INT,
    image_url TEXT,
    minio_url TEXT,
    local_path TEXT,
    status VARCHAR(32) DEFAULT 'pending',
    task_id TEXT,
    error_msg TEXT,
    width INT,
    height INT,
    reference_images TEXT,
    normalized_request TEXT,
    provider_request TEXT,
    provider_response TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS video_generations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    storyboard_id INT,
    drama_id INT,
    provider TEXT,
    prompt TEXT,
    model TEXT,
    image_gen_id INT,
    reference_mode TEXT,
    image_url TEXT,
    first_frame_url TEXT,
    last_frame_url TEXT,
    reference_image_urls TEXT,
    reference_video_urls TEXT,
    reference_audio_urls TEXT,
    duration INT,
    fps INT,
    resolution TEXT,
    aspect_ratio TEXT,
    style TEXT,
    motion_level INT,
    camera_motion TEXT,
    seed INT,
    video_url TEXT,
    minio_url TEXT,
    local_path TEXT,
    status VARCHAR(32) DEFAULT 'pending',
    task_id TEXT,
    error_msg TEXT,
    width INT,
    height INT,
    normalized_request TEXT,
    provider_request TEXT,
    provider_response TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    deleted_at TEXT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS video_merges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    episode_id INT,
    drama_id INT,
    title TEXT,
    provider TEXT,
    model TEXT,
    status VARCHAR(32) DEFAULT 'pending',
    scenes TEXT,
    merged_url TEXT,
    duration INT,
    task_id TEXT,
    error_msg TEXT,
    transition_type VARCHAR(32),
    transition_duration_ms INT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    deleted_at TEXT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS props (
    id INT AUTO_INCREMENT PRIMARY KEY,
    drama_id INT NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    description TEXT,
    prompt TEXT,
    image_url TEXT,
    reference_images TEXT,
    local_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    drama_id INT,
    episode_id INT,
    storyboard_id INT,
    storyboard_num INT,
    name TEXT,
    description TEXT,
    type TEXT,
    category TEXT,
    url TEXT,
    thumbnail_url TEXT,
    local_path TEXT,
    file_size INT,
    mime_type TEXT,
    width INT,
    height INT,
    duration INT,
    format TEXT,
    image_gen_id INT,
    video_gen_id INT,
    is_favorite TINYINT(1) DEFAULT 0,
    view_count INT DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]

async function ensureColumn(pool: Pool, database: string, table: string, column: string, definition: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok
       FROM information_schema.columns
      WHERE table_schema = ?
        AND table_name = ?
        AND column_name = ?
      LIMIT 1`,
    [database, table, column],
  )

  if (!rows.length) {
    await pool.query(`ALTER TABLE ${identifier(table)} ADD COLUMN ${identifier(column)} ${definition}`)
  }
}

async function initializeDatabase(pool: Pool, database: string) {
  for (const statement of tableStatements) {
    await pool.query(statement)
  }

  await ensureColumn(pool, database, 'episodes', 'image_config_id', 'INT')
  await ensureColumn(pool, database, 'episodes', 'video_config_id', 'INT')
  await ensureColumn(pool, database, 'episodes', 'transition_type', 'VARCHAR(32)')
  await ensureColumn(pool, database, 'episodes', 'transition_duration_ms', 'INT')
  await ensureColumn(pool, database, 'video_merges', 'transition_type', 'VARCHAR(32)')
  await ensureColumn(pool, database, 'video_merges', 'transition_duration_ms', 'INT')
  await ensureColumn(pool, database, 'dramas', 'image_config_id', 'INT')
  await ensureColumn(pool, database, 'dramas', 'video_config_id', 'INT')
  await ensureColumn(pool, database, 'characters', 'character_asset_id', 'INT')
  await ensureColumn(pool, database, 'characters', 'image_prompt', 'TEXT')
  await ensureColumn(pool, database, 'image_generations', 'normalized_request', 'TEXT')
  await ensureColumn(pool, database, 'image_generations', 'provider_request', 'TEXT')
  await ensureColumn(pool, database, 'image_generations', 'provider_response', 'TEXT')
  await ensureColumn(pool, database, 'video_generations', 'normalized_request', 'TEXT')
  await ensureColumn(pool, database, 'video_generations', 'provider_request', 'TEXT')
  await ensureColumn(pool, database, 'video_generations', 'provider_response', 'TEXT')
  await ensureColumn(pool, database, 'video_generations', 'reference_video_urls', 'TEXT')
  await ensureColumn(pool, database, 'video_generations', 'reference_audio_urls', 'TEXT')
  await ensureColumn(pool, database, 'video_generations', 'defect_check_attempt', 'INT DEFAULT 0')
  await ensureColumn(pool, database, 'video_generations', 'defect_check_parent_id', 'INT')
  await ensureColumn(pool, database, 'video_generations', 'defect_check_result', 'TEXT')
  await ensureColumn(pool, database, 'scenes', 'reference_image', 'TEXT')
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
