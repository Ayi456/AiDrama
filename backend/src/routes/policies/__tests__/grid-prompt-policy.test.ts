import assert from 'node:assert/strict'

import {
  buildGridCellPrompts,
  buildGridPrompt,
  findGridPayload,
  parseGridJsonArray,
  type GridPromptStoryboard,
  type GridReferenceAsset,
} from '../grid-prompt-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

const storyboards: GridPromptStoryboard[] = [
  {
    id: 1,
    storyboardNumber: 1,
    sceneId: 10,
    title: '雨巷相遇',
    description: '少女站在雨巷',
    imagePrompt: '青衣少女站在雨巷，电影光影',
    action: '少女抬头',
    movement: '固定镜头',
  },
  {
    id: 2,
    storyboardNumber: 2,
    sceneId: 10,
    title: '回望',
    description: '少女回头',
    imagePrompt: '青衣少女在雨巷回头',
    action: '少女回头',
    movement: '缓慢推进',
  },
]

const referenceAssets: GridReferenceAsset[] = [
  {
    path: 'static/characters/lin-xia.png',
    label: '林夏角色',
    kind: 'character',
    characterId: 20,
    imageIndex: 1,
    imageLabel: '图片1',
  },
  {
    path: 'static/scenes/rain-lane.png',
    label: '雨巷场景',
    kind: 'scene',
    sceneId: 10,
    imageIndex: 2,
    imageLabel: '图片2',
  },
]

const storyboardCharacterIds = new Map<number, number[]>([
  [1, [20]],
  [2, [20]],
])

runTest('parseGridJsonArray keeps non-empty string paths only', () => {
  assert.deepEqual(parseGridJsonArray('["a.png",null,"b.png",0]'), ['a.png', 'b.png'])
  assert.deepEqual(parseGridJsonArray('invalid'), [])
})

runTest('fallback builders preserve all supported grid modes and references', () => {
  const firstFrame = buildGridPrompt(
    'first_frame',
    storyboards,
    1,
    2,
    '国风',
    referenceAssets,
    storyboardCharacterIds,
  )
  assert.match(firstFrame, /1x2 grid layout/)
  assert.match(firstFrame, /图片1/)

  const firstLast = buildGridPrompt(
    'first_last',
    storyboards,
    2,
    2,
    '国风',
    referenceAssets,
    storyboardCharacterIds,
  )
  assert.match(firstLast, /alternating opening and closing beats/)

  const multiReferenceCells = buildGridCellPrompts(
    'multi_ref',
    storyboards,
    1,
    2,
    referenceAssets,
    storyboardCharacterIds,
  )
  assert.equal(multiReferenceCells.length, 2)
})

runTest('findGridPayload recovers nested fenced model output', () => {
  assert.deepEqual(
    findGridPayload(
      '```json\n{"result":{"grid_prompt":"grid","cell_prompts":[{"shot_number":1,"frame_type":"first_frame","prompt":"cell"}]}}\n```',
    ),
    {
      grid_prompt: 'grid',
      cell_prompts: [
        {
          shot_number: 1,
          frame_type: 'first_frame',
          prompt: 'cell',
        },
      ],
    },
  )
  assert.equal(findGridPayload('{"grid_prompt":"","cell_prompts":[]}'), null)
})
