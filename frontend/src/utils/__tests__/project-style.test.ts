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

runTest('project style helpers preserve literal style text', () => {
  assert.equal(normalizeProjectStyleInput('anime'), 'anime')
  assert.equal(getProjectStyleLabel('anime'), 'anime')
  assert.equal(getProjectStyleInputValue('anime'), 'anime')
  assert.equal(normalizeProjectStyleInput(' 动漫 '), '动漫')
})

runTest('user-entered 二次元 styles are preserved as custom styles', () => {
  assert.equal(normalizeProjectStyleInput('二次元'), '二次元')
  assert.equal(normalizeProjectStyleInput('二次元动漫'), '二次元动漫')
  assert.equal(getProjectStyleLabel('二次元'), '二次元')
  assert.equal(getProjectStyleLabel('二次元动漫'), '二次元动漫')
  assert.equal(getProjectStyleInputValue('二次元'), '二次元')
})

runTest('custom project styles are preserved', () => {
  assert.equal(normalizeProjectStyleInput('厚涂国漫'), '厚涂国漫')
  assert.equal(getProjectStyleLabel('厚涂国漫'), '厚涂国漫')
})
