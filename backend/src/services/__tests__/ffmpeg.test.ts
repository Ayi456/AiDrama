import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { escapeConcatPath, firstExistingPath } from '../ffmpeg.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('firstExistingPath returns first existing candidate', () => {
  const currentFile = fileURLToPath(import.meta.url)

  assert.equal(firstExistingPath([undefined, 'Z:/definitely/missing/ffmpeg.exe', currentFile]), currentFile)
})

runTest('escapeConcatPath normalizes Windows separators and quotes', () => {
  assert.equal(
    escapeConcatPath("C:\\videos\\hero's cut.mp4"),
    "C:/videos/hero'\\''s cut.mp4",
  )
})
