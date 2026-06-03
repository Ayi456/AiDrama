import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStoryboardsFromText } from '../storyboard-parse.js'

test('parses a plain JSON object', () => {
  const shots = parseStoryboardsFromText('{"storyboards":[{"shot_number":1,"title":"开场"}]}')
  assert.equal(shots.length, 1)
  assert.equal(shots[0].shot_number, 1)
  assert.equal(shots[0].title, '开场')
})

test('parses JSON wrapped in a ```json fence', () => {
  const text = '```json\n{"storyboards":[{"shot_number":1},{"shot_number":2}]}\n```'
  const shots = parseStoryboardsFromText(text)
  assert.equal(shots.length, 2)
})

test('extracts JSON even with surrounding prose', () => {
  const text = '好的，这是分镜：\n{"storyboards":[{"shot_number":1,"character_ids":[3,5],"scene_id":7}]}\n以上。'
  const shots = parseStoryboardsFromText(text)
  assert.deepEqual(shots[0].character_ids, [3, 5])
  assert.equal(shots[0].scene_id, 7)
})

test('throws on invalid JSON', () => {
  assert.throws(() => parseStoryboardsFromText('not json at all'), /未返回合法 JSON/)
})

test('throws when a shot is missing the required shot_number', () => {
  assert.throws(() => parseStoryboardsFromText('{"storyboards":[{"title":"无编号"}]}'), /结构不符合要求/)
})

test('throws when storyboards is empty', () => {
  assert.throws(() => parseStoryboardsFromText('{"storyboards":[]}'), /结构不符合要求/)
})
