import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.cwd(), 'src')
const indexSource = fs.readFileSync(path.join(root, 'db/index.ts'), 'utf8')
const serverSource = fs.readFileSync(path.join(root, 'server.ts'), 'utf8')

assert.equal(/^await\s/m.test(indexSource), false)
assert.match(serverSource, /await ensureDatabaseReady\(\)[\s\S]*serve\(/)

console.log('PASS database I/O is owned by process entry points')
