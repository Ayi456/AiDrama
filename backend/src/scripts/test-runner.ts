import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function sourceTestPathFor(compiledTestFile: string, compiledRoot: string, sourceRoot: string) {
  const relative = path.relative(compiledRoot, compiledTestFile)
  return path.join(sourceRoot, relative).replace(/\.js$/, '.ts')
}

export function discoverCompiledTestFiles(root: string, sourceRoot?: string): string[] {
  if (!fs.existsSync(root)) return []

  const discovered: string[] = []
  const visit = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(fullPath)
      } else if (/\.test\.js$/.test(entry.name)) {
        if (sourceRoot && !fs.existsSync(sourceTestPathFor(fullPath, root, sourceRoot))) continue
        discovered.push(fullPath)
      }
    }
  }

  visit(root)
  return discovered.sort((a, b) => a.localeCompare(b))
}

export function runCompiledTests(root = path.resolve('dist')) {
  const tests = discoverCompiledTestFiles(root, path.resolve('src'))
  if (!tests.length) {
    console.error(`No compiled test files found under ${root}`)
    return 1
  }

  for (const testFile of tests) {
    const result = spawnSync(process.execPath, [testFile], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    })
    if (result.status !== 0) return result.status || 1
    if (result.error) throw result.error
  }

  return 0
}

function isMain(metaUrl: string) {
  return !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(metaUrl)
}

if (isMain(import.meta.url)) {
  process.exitCode = runCompiledTests()
}
