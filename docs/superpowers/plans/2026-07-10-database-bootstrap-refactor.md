# Database Bootstrap Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make database runtime exports synchronous and move all MySQL I/O into an explicit, idempotent bootstrap awaited by process entry points.

**Architecture:** Configuration, DDL statements, additive migrations, runtime objects, and bootstrap orchestration become independent modules. `db/index.ts` stays source-compatible for consumers while server and maintenance entry points explicitly establish readiness.

**Tech Stack:** Node.js 20+, TypeScript 6, mysql2, Drizzle ORM, native Node test/assert tooling.

## Global Constraints

- Preserve the exported `db`, `mysqlPool`, `schema`, and `DB` names.
- Preserve existing DDL, migrations, backfills, default billing data, and query helper behavior.
- Do not accept production requests before required database bootstrap succeeds.
- Required bootstrap failures are fatal; optional asset URL backfill failures remain warnings.
- Do not add dependencies or introduce a new migration framework.
- Finish with backend typecheck and full backend tests passing.

---

## File Map

- Create `backend/src/db/config.ts`: deterministic environment-to-MySQL configuration.
- Create `backend/src/db/table-statements.ts`: ordered `CREATE TABLE IF NOT EXISTS` statements.
- Create `backend/src/db/migrations.ts`: ordered additive schema/data migration operations.
- Create `backend/src/db/runtime.ts`: synchronous pool and Drizzle objects.
- Create `backend/src/db/bootstrap.ts`: database creation, migration, optional backfill, idempotent readiness.
- Modify `backend/src/db/index.ts`: compatibility exports only.
- Modify `backend/src/server.ts`: await readiness before `serve`.
- Modify database maintenance scripts: await readiness before queries.
- Add tests under `backend/src/db/__tests__/` and update the existing migration source test.

### Task 1: Extract deterministic database configuration

**Files:**
- Create: `backend/src/db/config.ts`
- Create: `backend/src/db/__tests__/config.test.ts`
- Modify: `backend/src/db/index.ts`

**Interfaces:**
- Produces: `resolveMysqlConfig(options): PoolOptions`, `mysqlConfig`, `DEFAULT_DB_NAME`, `PROJECT_ROOT`.
- Consumes: process environment and `parseLooseEnvFile` from `utils/project-env.ts`.

- [ ] **Step 1: Write failing configuration tests**

```ts
import assert from 'node:assert/strict'
import { resolveMysqlConfig } from '../config.js'

const fromUrl = resolveMysqlConfig({
  env: { DATABASE_URL: 'mysql://alice:secret@db.example:3307/drama' },
  looseEnv: {},
})
assert.equal(fromUrl.host, 'db.example')
assert.equal(fromUrl.port, 3307)
assert.equal(fromUrl.user, 'alice')
assert.equal(fromUrl.password, 'secret')
assert.equal(fromUrl.database, 'drama')

const fromFields = resolveMysqlConfig({
  env: { DB_HOST: '127.0.0.2', DB_PORT: '3308', DB_USER: 'root', DB_PASSWORD: 'pw', DB_NAME: 'AiDramaTest' },
  looseEnv: {},
})
assert.equal(fromFields.host, '127.0.0.2')
assert.equal(fromFields.port, 3308)
assert.equal(fromFields.database, 'AiDramaTest')
console.log('PASS database config is resolved without I/O')
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `npx tsx src/db/__tests__/config.test.ts`

Expected: FAIL with missing `db/config.js`.

- [ ] **Step 3: Implement the pure resolver and default configuration**

```ts
export type MysqlConfigSources = {
  env: Record<string, string | undefined>
  looseEnv: Record<string, string | undefined>
}

export function resolveMysqlConfig({ env, looseEnv }: MysqlConfigSources): PoolOptions {
  const value = (...keys: string[]) => keys.map(key => env[key] || looseEnv[key]).find(Boolean)
  const databaseUrl = value('DATABASE_URL')
  if (databaseUrl) {
    const parsed = new URL(databaseUrl)
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, '') || DEFAULT_DB_NAME),
      waitForConnections: true,
      connectionLimit: Number(value('DB_CONNECTION_LIMIT') || 10),
    }
  }
  return {
    host: value('DB_HOST', 'MYSQL_HOST') || '127.0.0.1',
    port: Number(value('DB_PORT', 'MYSQL_PORT') || 3306),
    user: value('DB_USER', 'MYSQL_USER') || 'root',
    password: value('DB_PASSWORD', 'MYSQL_PASSWORD') || '',
    database: value('DB_NAME', 'MYSQL_DATABASE') || DEFAULT_DB_NAME,
    waitForConnections: true,
    connectionLimit: Number(value('DB_CONNECTION_LIMIT') || 10),
  }
}
```

Keep any current SSL/URL options present in `getMysqlConfig()` when transferring its branches. Export the process-derived `mysqlConfig` once from this module and import it from `index.ts`.

- [ ] **Step 4: Run focused test and typecheck**

Run: `npx tsx src/db/__tests__/config.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit configuration extraction**

```bash
git add backend/src/db/config.ts backend/src/db/__tests__/config.test.ts backend/src/db/index.ts
git commit -m "refactor(backend): extract database configuration"
```

### Task 2: Extract table statements and additive migrations

**Files:**
- Create: `backend/src/db/table-statements.ts`
- Create: `backend/src/db/migrations.ts`
- Modify: `backend/src/db/index.ts`
- Modify: `backend/src/db/__tests__/schema-migration.test.ts`

**Interfaces:**
- Produces: `tableStatements: readonly string[]`, `runAdditiveMigrations(pool, database): Promise<void>`.
- Consumes: mysql2 `Pool`; the exact ordered statements and migration operations currently in `index.ts`.

- [ ] **Step 1: Point the migration source test at the future owner**

Replace the path lookup in `schema-migration.test.ts` with:

```ts
const migrationSourcePath = [
  path.resolve(__dirname, '../migrations.ts'),
  path.resolve(__dirname, '../migrations.js'),
].find(candidate => fs.existsSync(candidate))
```

Read `migrationSourcePath` and retain the existing assertions for image/video provider usage columns.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx tsx src/db/__tests__/schema-migration.test.ts`

Expected: FAIL with `Unable to locate compiled or source db/migrations file`.

- [ ] **Step 3: Move schema responsibilities behind one function**

Move the complete `tableStatements` array to `table-statements.ts` and export it. Move `ensureColumn`, `ensureIndex`, `backfillOwnerColumns`, every existing `ensureColumn`/`ensureIndex` call, and the billing default insert to `migrations.ts`:

```ts
export async function runAdditiveMigrations(pool: Pool, database: string) {
  // Keep the current ensureColumn calls in their current order.
  // Keep the current ensureIndex calls in their current order.
  await pool.query(
    `INSERT IGNORE INTO billing_settings (setting_key, setting_value, updated_at)
     VALUES ('video_price_per_second', 1.00, ?)`,
    [new Date().toISOString()],
  )
  await backfillOwnerColumns(pool)
}
```

Replace `initializeDatabase` in `index.ts` with imports of `tableStatements` and `runAdditiveMigrations` while bootstrap still resides there.

- [ ] **Step 4: Run migration tests and backend typecheck**

Run: `npx tsx src/db/__tests__/schema-migration.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit migration extraction**

```bash
git add backend/src/db/table-statements.ts backend/src/db/migrations.ts backend/src/db/index.ts backend/src/db/__tests__/schema-migration.test.ts
git commit -m "refactor(backend): isolate database migrations"
```

### Task 3: Create synchronous runtime objects and idempotent bootstrap

**Files:**
- Create: `backend/src/db/runtime.ts`
- Create: `backend/src/db/bootstrap.ts`
- Create: `backend/src/db/__tests__/bootstrap.test.ts`
- Modify: `backend/src/db/index.ts`

**Interfaces:**
- Produces: synchronous `mysqlPool` and `db`; `createIdempotentInitializer`; `ensureDatabaseReady(): Promise<void>`.
- Consumes: `mysqlConfig`, `tableStatements`, `runAdditiveMigrations`, and `backfillPersistedAssetUrls`.

- [ ] **Step 1: Write the failing idempotency test**

```ts
import assert from 'node:assert/strict'
import { createIdempotentInitializer } from '../bootstrap.js'

let calls = 0
let release!: () => void
const gate = new Promise<void>(resolve => { release = resolve })
const ensureReady = createIdempotentInitializer(async () => {
  calls += 1
  await gate
})

const first = ensureReady()
const second = ensureReady()
assert.strictEqual(first, second)
assert.equal(calls, 1)
release()
await Promise.all([first, second])
await ensureReady()
assert.equal(calls, 1)
console.log('PASS database bootstrap is idempotent')
```

- [ ] **Step 2: Run the test and verify the bootstrap module is missing**

Run: `npx tsx src/db/__tests__/bootstrap.test.ts`

Expected: FAIL with missing `db/bootstrap.js`.

- [ ] **Step 3: Implement runtime and bootstrap modules**

`runtime.ts` performs no awaited work:

```ts
export const mysqlPool = mysql.createPool(mysqlConfig)
export const db = drizzle(mysqlPool, { schema, mode: 'default' })

installQueryExecutionHelpers(db.select().from(schema.dramas))
installQueryExecutionHelpers(db.insert(schema.dramas).values({ title: '', createdAt: '', updatedAt: '' }))
installQueryExecutionHelpers(db.update(schema.dramas).set({ updatedAt: '' }).where(eq(schema.dramas.id, 0)))
installQueryExecutionHelpers(db.delete(schema.dramas).where(eq(schema.dramas.id, 0)))
```

`bootstrap.ts` owns all I/O and the idempotency closure:

```ts
export function createIdempotentInitializer(initialize: () => Promise<void>) {
  let readiness: Promise<void> | null = null
  return () => {
    if (!readiness) {
      readiness = initialize().catch(error => {
        readiness = null
        throw error
      })
    }
    return readiness
  }
}

async function bootstrapDatabase() {
  await ensureDatabaseExists(mysqlConfig)
  for (const statement of tableStatements) await mysqlPool.query(statement)
  await runAdditiveMigrations(mysqlPool, String(mysqlConfig.database || DEFAULT_DB_NAME))
  try {
    await backfillPersistedAssetUrls(mysqlPool)
  } catch (error) {
    console.warn('[DB] Failed to backfill COS asset URLs:', error)
  }
}

export const ensureDatabaseReady = createIdempotentInitializer(bootstrapDatabase)
```

Reduce `index.ts` to stable exports:

```ts
export { db, mysqlPool } from './runtime.js'
export { ensureDatabaseReady } from './bootstrap.js'
export { schema } from './schema.js'
export type { DB } from './runtime.js'
```

- [ ] **Step 4: Run focused test and typecheck**

Run: `npx tsx src/db/__tests__/bootstrap.test.ts`

Expected: PASS without connecting to MySQL.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit runtime/bootstrap separation**

```bash
git add backend/src/db/runtime.ts backend/src/db/bootstrap.ts backend/src/db/index.ts backend/src/db/__tests__/bootstrap.test.ts
git commit -m "refactor(backend): separate database runtime and bootstrap"
```

### Task 4: Make process entry points await database readiness

**Files:**
- Modify: `backend/src/server.ts`
- Modify: `backend/src/scripts/backfill-cos-asset-urls.ts`
- Modify: `backend/src/scripts/check-cos-asset-urls.ts`
- Modify: `backend/src/scripts/set-video-price.ts`
- Create: `backend/src/db/__tests__/bootstrap-boundary.test.ts`

**Interfaces:**
- Consumes: `ensureDatabaseReady(): Promise<void>`.
- Guarantees: server listening and maintenance queries occur only after readiness.

- [ ] **Step 1: Write the failing source-boundary test**

```ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.cwd(), 'src')
const indexSource = fs.readFileSync(path.join(root, 'db/index.ts'), 'utf8')
const serverSource = fs.readFileSync(path.join(root, 'server.ts'), 'utf8')
assert.equal(/^await\s/m.test(indexSource), false)
assert.match(serverSource, /await ensureDatabaseReady\(\)[\s\S]*serve\(/)
console.log('PASS database I/O is owned by process entry points')
```

- [ ] **Step 2: Run the test and verify server readiness is absent**

Run: `npx tsx src/db/__tests__/bootstrap-boundary.test.ts`

Expected: FAIL on the server source assertion.

- [ ] **Step 3: Await readiness before entry-point work**

In `server.ts`:

```ts
import { ensureDatabaseReady } from './db/index.js'

await ensureDatabaseReady()

console.log(`AiDrama TS server on http://${hostname}:${port}`)
serve({ fetch: app.fetch, port, hostname })
```

In each maintenance script, import `ensureDatabaseReady` beside `mysqlPool` and place `await ensureDatabaseReady()` before the first query/backfill call. Keep pool shutdown behavior unchanged.

- [ ] **Step 4: Run full backend verification**

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm test`

Expected: all backend tests PASS.

- [ ] **Step 5: Commit explicit entry-point readiness**

```bash
git add backend/src/server.ts backend/src/scripts/backfill-cos-asset-urls.ts backend/src/scripts/check-cos-asset-urls.ts backend/src/scripts/set-video-price.ts backend/src/db/__tests__/bootstrap-boundary.test.ts
git commit -m "refactor(backend): await database readiness at entry points"
```
