import assert from 'node:assert/strict'

import {
  getNextStoryboardNumber,
  renumberStoryboardsForAppend,
  splitScriptIntoStoryboardChunks,
} from '../storyboard-chunks.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('splitScriptIntoStoryboardChunks keeps scene-like sections below the target size', () => {
  const script = [
    '## S1 | INT | Morning',
    'A'.repeat(420),
    '## S2 | EXT | Noon',
    'B'.repeat(420),
    '## S3 | INT | Night',
    'C'.repeat(420),
  ].join('\n\n')

  const chunks = splitScriptIntoStoryboardChunks(script, { maxChars: 520 })

  assert.equal(chunks.length, 3)
  assert.deepEqual(chunks.map((chunk) => chunk.index), [1, 2, 3])
  assert.deepEqual(chunks.map((chunk) => chunk.total), [3, 3, 3])
  assert.ok(chunks[0]?.script.includes('S1'))
  assert.ok(chunks[1]?.script.includes('S2'))
  assert.ok(chunks[2]?.script.includes('S3'))
  assert.ok(chunks.every((chunk) => chunk.script.length <= 520))
})

runTest('splitScriptIntoStoryboardChunks falls back to paragraph batches without headings', () => {
  const script = [
    'A'.repeat(300),
    'B'.repeat(300),
    'C'.repeat(300),
    'D'.repeat(300),
  ].join('\n\n')

  const chunks = splitScriptIntoStoryboardChunks(script, { maxChars: 650 })

  assert.equal(chunks.length, 2)
  assert.ok(chunks[0]?.script.includes('A'.repeat(10)))
  assert.ok(chunks[0]?.script.includes('B'.repeat(10)))
  assert.ok(chunks[1]?.script.includes('C'.repeat(10)))
  assert.ok(chunks[1]?.script.includes('D'.repeat(10)))
})

runTest('renumberStoryboardsForAppend continues after the existing maximum shot number', () => {
  const nextNumber = getNextStoryboardNumber([
    { storyboardNumber: 1 },
    { storyboardNumber: 4 },
    { storyboardNumber: 3 },
  ])

  const storyboards = renumberStoryboardsForAppend(
    [
      { shot_number: 1, title: 'first generated shot' },
      { shot_number: 2, title: 'second generated shot' },
    ],
    nextNumber,
  )

  assert.deepEqual(storyboards.map((storyboard) => storyboard.shot_number), [5, 6])
  assert.equal(storyboards[0]?.title, 'first generated shot')
  assert.equal(storyboards[1]?.title, 'second generated shot')
})
