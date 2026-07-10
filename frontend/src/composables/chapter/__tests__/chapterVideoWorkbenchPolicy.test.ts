import assert from 'node:assert/strict'

import {
  removeKeyedValue,
  setKeyedValue,
  storyboardStateKey,
  uniqueMediaByUrl,
  uniqueStrings,
} from '../chapterVideoWorkbenchPolicy.ts'

assert.equal(storyboardStateKey({ id: 9 }, 2), '9')
assert.equal(storyboardStateKey({}, 2), '2')
assert.equal(storyboardStateKey(null, 0), 'current')
assert.deepEqual(setKeyedValue({ old: 1 }, 'shot', 2), { old: 1, shot: 2 })
assert.deepEqual(removeKeyedValue({ old: 1, shot: 2 }, 'shot'), { old: 1 })
assert.deepEqual(uniqueStrings([' a ', '', 'a', 'b']), ['a', 'b'])
assert.deepEqual(
  uniqueMediaByUrl([{ url: 'a' }, { url: 'a' }, { url: 'b' }]),
  [{ url: 'a' }, { url: 'b' }],
)

console.log('PASS chapter video workbench policies are deterministic')
