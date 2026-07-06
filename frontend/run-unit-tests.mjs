import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const tsxCli = path.resolve(root, 'node_modules', 'tsx', 'dist', 'cli.mjs')

if (!fs.existsSync(tsxCli)) {
  console.error('tsx is not installed; run `npm install` in frontend/ first.')
  process.exit(1)
}

function discoverTestFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) return discoverTestFiles(fullPath)
      return /\.test\.(ts|mjs)$/.test(entry.name) ? [fullPath] : []
    })
}

const tests = discoverTestFiles(path.resolve(root, 'src'))

if (!tests.length) {
  console.error('No test files found under src/.')
  process.exit(1)
}

for (const testFile of tests) {
  const result = spawnSync(process.execPath, [tsxCli, testFile], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}

console.log(`Frontend unit tests passed (${tests.length} files).`)
