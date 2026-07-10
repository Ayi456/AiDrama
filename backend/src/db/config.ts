import type { PoolOptions } from 'mysql2/promise'
import path from 'path'
import { fileURLToPath } from 'url'

import { ensureProjectEnvLoaded, parseLooseEnvFile } from '../utils/project-env.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const PROJECT_ROOT = path.resolve(__dirname, '../../..')
export const DEFAULT_DB_NAME = 'AiDrama'

export type MysqlConfigSources = {
  env: Record<string, string | undefined>
  looseEnv: Record<string, string | undefined>
}

function sourceValue(sources: MysqlConfigSources, ...keys: string[]) {
  for (const key of keys) {
    const value = sources.env[key] ?? sources.looseEnv[key]
    if (value != null && String(value).trim()) return String(value).trim()
  }
  return ''
}

function numberValue(sources: MysqlConfigSources, defaultValue: number, ...keys: string[]) {
  const parsed = Number(sourceValue(sources, ...keys))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

export function resolveMysqlConfig(sources: MysqlConfigSources): PoolOptions {
  const databaseUrl = sourceValue(sources, 'DATABASE_URL', 'MYSQL_URL')
  if (databaseUrl) {
    const url = new URL(databaseUrl)
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\/+/, '')) || DEFAULT_DB_NAME,
      waitForConnections: true,
      connectionLimit: numberValue(sources, 10, 'DB_CONNECTION_LIMIT', 'MYSQL_CONNECTION_LIMIT'),
      charset: 'utf8mb4',
    }
  }

  const host = sourceValue(sources, 'DB_HOST', 'MYSQL_HOST', '主机')
  const user = sourceValue(sources, 'DB_USER', 'MYSQL_USER', '用户名')
  const password = sourceValue(sources, 'DB_PASSWORD', 'MYSQL_PASSWORD', '密码')
  const database = sourceValue(sources, 'DB_NAME', 'MYSQL_DATABASE', 'DATABASE_NAME', '数据库') || DEFAULT_DB_NAME
  const missing = [!host && 'DB_HOST', !user && 'DB_USER'].filter(Boolean)

  if (missing.length) {
    throw new Error(`Missing MySQL database config: ${missing.join(', ')}`)
  }

  return {
    host,
    port: numberValue(sources, 3306, 'DB_PORT', 'MYSQL_PORT', '端口'),
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: numberValue(sources, 10, 'DB_CONNECTION_LIMIT', 'MYSQL_CONNECTION_LIMIT'),
    charset: 'utf8mb4',
  }
}

ensureProjectEnvLoaded()

const looseEnv = parseLooseEnvFile(path.join(PROJECT_ROOT, '.env'))

export const mysqlConfig = resolveMysqlConfig({ env: process.env, looseEnv })
