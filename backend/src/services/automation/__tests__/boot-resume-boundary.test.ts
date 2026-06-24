import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('automation boot resume is started by the server entrypoint, not the database module', () => {
  const dbSource = fs.readFileSync(path.resolve('src/db/index.ts'), 'utf8')
  const serverSource = fs.readFileSync(path.resolve('src/server.ts'), 'utf8')

  assert.doesNotMatch(dbSource, /bootResume\(/)
  assert.match(serverSource, /bootResume\(/)
})
