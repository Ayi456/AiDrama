import assert from 'node:assert/strict'

import {
  getProjectStyleInputValue,
  getProjectStyleLabel,
  normalizeProjectStyleInput,
} from '../project-style.ts'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('anime preset is displayed as 动漫', () => {
  assert.equal(getProjectStyleLabel('anime'), '动漫')
  assert.equal(getProjectStyleInputValue('anime'), '动漫')
})

runTest('legacy 二次元 input maps to the anime preset', () => {
  assert.equal(normalizeProjectStyleInput('二次元'), 'anime')
  assert.equal(normalizeProjectStyleInput('二次元动漫'), 'anime')
  assert.equal(getProjectStyleLabel('二次元'), '动漫')
  assert.equal(getProjectStyleLabel('二次元动漫'), '动漫')
})

runTest('custom project styles are preserved', () => {
  assert.equal(normalizeProjectStyleInput('厚涂国漫'), '厚涂国漫')
  assert.equal(getProjectStyleLabel('厚涂国漫'), '厚涂国漫')
})
