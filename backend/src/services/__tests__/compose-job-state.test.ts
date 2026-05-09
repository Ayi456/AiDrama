import assert from 'node:assert/strict'

import {
  buildComposeCompletionPatch,
  buildComposeFailurePatch,
  buildComposeProcessingPatch,
  createComposeJobPersistence,
} from '../compose/compose-job-state.js'

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

await runTest('compose patch builders preserve storyboard compose lifecycle fields', () => {
  assert.deepEqual(
    buildComposeProcessingPatch('t1'),
    { status: 'compose_processing', composedVideoUrl: null, updatedAt: 't1' },
  )
  assert.deepEqual(
    buildComposeFailurePatch('t2'),
    { status: 'compose_failed', composedVideoUrl: null, updatedAt: 't2' },
  )
  assert.deepEqual(
    buildComposeCompletionPatch('static/composed/a.mp4', 't3'),
    { status: 'compose_completed', composedVideoUrl: 'static/composed/a.mp4', updatedAt: 't3' },
  )
})

await runTest('createComposeJobPersistence forwards loads and lifecycle patches', async () => {
  const calls: unknown[] = []
  const persistence = createComposeJobPersistence({
    loadStoryboard: async (storyboardId) => {
      calls.push({ action: 'load', storyboardId })
      return {
        id: storyboardId,
        storyboardNumber: 3,
        episodeId: 9,
        videoUrl: 'static/videos/source.mp4',
      }
    },
    updateStoryboard: async (storyboardId, patch) => {
      calls.push({ action: 'update', storyboardId, patch })
    },
  })

  assert.deepEqual(await persistence.loadStoryboard(17), {
    id: 17,
    storyboardNumber: 3,
    episodeId: 9,
    videoUrl: 'static/videos/source.mp4',
  })
  await persistence.markComposeProcessing(17, 't4')
  await persistence.markComposeFailed(17, 't5')
  await persistence.completeStoryboardCompose(17, 'static/composed/out.mp4', 't6')

  assert.deepEqual(calls, [
    { action: 'load', storyboardId: 17 },
    { action: 'update', storyboardId: 17, patch: { status: 'compose_processing', composedVideoUrl: null, updatedAt: 't4' } },
    { action: 'update', storyboardId: 17, patch: { status: 'compose_failed', composedVideoUrl: null, updatedAt: 't5' } },
    { action: 'update', storyboardId: 17, patch: { status: 'compose_completed', composedVideoUrl: 'static/composed/out.mp4', updatedAt: 't6' } },
  ])
})
