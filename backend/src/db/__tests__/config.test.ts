import assert from 'node:assert/strict'

import { identifier, resolveMysqlConfig } from '../config.js'

const fromUrl = resolveMysqlConfig({
  env: { DATABASE_URL: 'mysql://alice:secret@db.example:3307/drama' },
  looseEnv: {},
})
assert.equal(fromUrl.host, 'db.example')
assert.equal(fromUrl.port, 3307)
assert.equal(fromUrl.user, 'alice')
assert.equal(fromUrl.password, 'secret')
assert.equal(fromUrl.database, 'drama')
assert.equal(fromUrl.charset, 'utf8mb4')

const fromFields = resolveMysqlConfig({
  env: {
    DB_HOST: '127.0.0.2',
    DB_PORT: '3308',
    DB_USER: 'root',
    DB_PASSWORD: 'pw',
    DB_NAME: 'AiDramaTest',
  },
  looseEnv: {},
})
assert.equal(fromFields.host, '127.0.0.2')
assert.equal(fromFields.port, 3308)
assert.equal(fromFields.user, 'root')
assert.equal(fromFields.database, 'AiDramaTest')

assert.throws(
  () => resolveMysqlConfig({ env: {}, looseEnv: {} }),
  /Missing MySQL database config: DB_HOST, DB_USER/,
)
assert.equal(identifier('video_generations'), '`video_generations`')
assert.throws(() => identifier('video-generations'), /Invalid MySQL identifier/)

console.log('PASS database config is resolved without I/O')
