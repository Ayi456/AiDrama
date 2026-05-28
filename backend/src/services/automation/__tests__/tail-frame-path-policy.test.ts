import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import {
  resolveAutomationProjectRoot,
  resolveTailFrameInputPath,
} from '../tail-frame-path-policy.js'

test('resolveAutomationProjectRoot resolves from automation service source directory to repo root', () => {
  const sourceDir = path.join('E:', 'Desktop', 'work', 'AiDrama', 'backend', 'src', 'services', 'automation')
  assert.equal(
    resolveAutomationProjectRoot(sourceDir),
    path.join('E:', 'Desktop', 'work', 'AiDrama'),
  )
})

test('resolveTailFrameInputPath maps static video paths below data root', () => {
  assert.equal(
    resolveTailFrameInputPath('static/videos/shot.mp4', '/repo/data', '/repo/data/static'),
    path.join('/repo/data', 'static/videos/shot.mp4'),
  )
})

test('resolveTailFrameInputPath ignores blank and remote paths', () => {
  assert.equal(resolveTailFrameInputPath('', '/repo/data', '/repo/data/static'), null)
  assert.equal(resolveTailFrameInputPath('https://cdn.example.com/shot.mp4', '/repo/data', '/repo/data/static'), null)
})
