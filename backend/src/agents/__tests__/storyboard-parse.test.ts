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

test('normalizes null optional text fields from model JSON', () => {
  const shots = parseStoryboardsFromText(JSON.stringify({
    storyboards: [{
      shot_number: 1,
      title: null,
      shot_type: null,
      angle: null,
      movement: null,
      location: null,
      time: null,
      action: null,
      dialogue: null,
      description: null,
      result: null,
      atmosphere: null,
      image_prompt: null,
      video_prompt: null,
      bgm_prompt: null,
      sound_effect: null,
      duration: null,
      scene_id: null,
      character_ids: null,
    }],
  }))

  assert.equal(shots.length, 1)
  assert.deepEqual(shots[0], {
    shot_number: 1,
    scene_id: null,
    character_ids: [],
  })
})

test('parses director planning fields for storyboard shots', () => {
  const shots = parseStoryboardsFromText(JSON.stringify({
    storyboards: [{
      shot_number: 1,
      title: '医院真相',
      director_intent: '揭开真相',
      audience_info_change: '观众确认被照顾的人其实是林晚',
      emotion_shift: '林晚从疑惑转为害怕和明白',
      dramatic_value: '完成核心反转并推动父女关系变化',
    }],
  }))

  assert.equal(shots[0].director_intent, '揭开真相')
  assert.equal(shots[0].audience_info_change, '观众确认被照顾的人其实是林晚')
  assert.equal(shots[0].emotion_shift, '林晚从疑惑转为害怕和明白')
  assert.equal(shots[0].dramatic_value, '完成核心反转并推动父女关系变化')
})

test('rejects duplicate shot numbers from model JSON', () => {
  assert.throws(
    () => parseStoryboardsFromText('{"storyboards":[{"shot_number":1,"title":"开场"},{"shot_number":1,"title":"重复"}]}'),
    /分镜编号重复/,
  )
})

test('rejects placeholder shots without production content', () => {
  assert.throws(
    () => parseStoryboardsFromText(JSON.stringify({
      storyboards: [{
        shot_number: 28,
        title: '镜头28',
        video_prompt: '镜头标题：镜头28',
      }],
    })),
    /占位镜头/,
  )
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
