import assert from 'node:assert/strict'

import type { ChapterScene } from '../chapterMediaTypes.ts'
import { createChapterSceneFieldSaver } from '../useChapterSceneFieldSave.ts'

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

await runTest('scene field saver persists prompt changes before resolving', async () => {
  const calls: Array<{ id: number; payload: Record<string, unknown> }> = []
  const scene: ChapterScene = { id: 8, location: 'Atrium', prompt: 'old prompt' }
  const saver = createChapterSceneFieldSaver({
    updateScene: async (id, payload) => {
      calls.push({ id, payload })
    },
  })

  await saver.updateSceneField(scene, 'prompt', 'new prompt')

  assert.equal(scene.prompt, 'new prompt')
  assert.deepEqual(calls, [{ id: 8, payload: { prompt: 'new prompt' } }])
})

await runTest('scene field saver rolls back optimistic prompt changes when saving fails', async () => {
  const scene: ChapterScene = { id: 9, location: 'Office', prompt: 'old prompt' }
  const saver = createChapterSceneFieldSaver({
    updateScene: async () => {
      throw new Error('save failed')
    },
  })

  await assert.rejects(
    saver.updateSceneField(scene, 'prompt', 'new prompt'),
    /save failed/,
  )

  assert.equal(scene.prompt, 'old prompt')
})
