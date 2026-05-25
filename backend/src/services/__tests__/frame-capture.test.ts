import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCaptureLastFrameArgs, resolveTailFrameOutputPath } from '../media/frame-capture.js'

test('resolveTailFrameOutputPath maps video id to a deterministic path', () => {
  const result = resolveTailFrameOutputPath(42, '/abs/data/static')
  assert.match(result, /tail-frames[\\\/]42\.png$/)
})

test('buildCaptureLastFrameArgs uses -sseof and -update flags', () => {
  const args = buildCaptureLastFrameArgs('/tmp/in.mp4', '/tmp/out.png')
  assert.deepEqual(args.inputOptions, ['-sseof', '-1'])
  assert.deepEqual(args.outputOptions, ['-update', '1', '-q:v', '1'])
  assert.equal(args.input, '/tmp/in.mp4')
  assert.equal(args.output, '/tmp/out.png')
})
