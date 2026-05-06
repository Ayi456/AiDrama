import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  resolveDataRoot,
  resolveFrontendPublicPath,
  resolveStorageRoot,
} from '../runtime-paths.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const previous: Record<string, string | undefined> = {}
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key]
    if (values[key] == null) delete process.env[key]
    else process.env[key] = values[key]
  }

  try {
    fn()
  } finally {
    for (const key of Object.keys(values)) {
      if (previous[key] == null) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
}

runTest('resolveFrontendPublicPath uses FRONTEND_PUBLIC_PATH when provided', () => {
  withEnv({ FRONTEND_PUBLIC_PATH: '/tmp/aidrama-public' }, () => {
    assert.equal(resolveFrontendPublicPath('/repo'), '/tmp/aidrama-public')
  })
})

runTest('resolveFrontendPublicPath prefers Vite build output over public fallback', () => {
  withEnv({ FRONTEND_PUBLIC_PATH: undefined }, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidrama-runtime-paths-'))
    const viteDist = path.join(root, 'frontend', 'dist-vite')
    const publicDir = path.join(root, 'public')
    fs.mkdirSync(viteDist, { recursive: true })
    fs.mkdirSync(publicDir, { recursive: true })

    assert.equal(resolveFrontendPublicPath(root), viteDist)
  })
})

runTest('resolveDataRoot and resolveStorageRoot use SCF writable env paths', () => {
  withEnv({
    DATA_ROOT: '/tmp/aidrama',
    STORAGE_PATH: '/tmp/aidrama/static',
  }, () => {
    assert.equal(resolveDataRoot('/repo'), '/tmp/aidrama')
    assert.equal(resolveStorageRoot('/repo'), '/tmp/aidrama/static')
  })
})

runTest('resolveStorageRoot defaults below data root', () => {
  withEnv({ DATA_ROOT: '/tmp/aidrama', STORAGE_PATH: undefined }, () => {
    assert.equal(resolveStorageRoot('/repo'), path.join('/tmp/aidrama', 'static'))
  })
})
