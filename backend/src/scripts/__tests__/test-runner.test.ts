import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { discoverCompiledTestFiles } from '../test-runner.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('discoverCompiledTestFiles recursively finds compiled JS tests in stable order', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidrama-test-runner-'))
  const files = [
    path.join(root, 'services', '__tests__', 'media.test.js'),
    path.join(root, 'routes', '__tests__', 'auth.test.js'),
    path.join(root, 'routes', '__tests__', 'auth.test.d.ts'),
    path.join(root, 'routes', 'not-a-test.js'),
  ]

  for (const file of files) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '')
  }

  assert.deepEqual(
    discoverCompiledTestFiles(root).map(file => path.relative(root, file).replaceAll(path.sep, '/')),
    [
      'routes/__tests__/auth.test.js',
      'services/__tests__/media.test.js',
    ],
  )
})

runTest('discoverCompiledTestFiles skips stale dist tests without a source file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidrama-test-runner-dist-'))
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aidrama-test-runner-src-'))
  const activeDist = path.join(root, 'services', '__tests__', 'active.test.js')
  const staleDist = path.join(root, '__tests__', 'stale.test.js')
  const activeSource = path.join(sourceRoot, 'services', '__tests__', 'active.test.ts')

  for (const file of [activeDist, staleDist, activeSource]) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '')
  }

  assert.deepEqual(
    discoverCompiledTestFiles(root, sourceRoot).map(file => path.relative(root, file).replaceAll(path.sep, '/')),
    ['services/__tests__/active.test.js'],
  )
})
