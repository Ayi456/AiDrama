import assert from 'node:assert/strict'

import {
  buildEpisodeMergeRecord,
  buildEpisodeVideoClearPatch,
  buildEpisodeVideoCompletionPatch,
  buildMergeCompletionPatch,
  buildMergeFailurePatch,
  buildReplacedMergePatch,
  createMergeJobPersistence,
} from '../merge/merge-job-state.js'

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

await runTest('buildEpisodeMergeRecord captures selected storyboard clips as AiDrama merge scenes', () => {
  const record = buildEpisodeMergeRecord({
    episodeId: 7,
    dramaId: 2,
    createdAt: 't1',
    storyboards: [
      { id: 11, storyboardNumber: 1, videoUrl: 'static/videos/a.mp4', composedVideoUrl: null, mergeVideoUrl: 'static/videos/a.mp4' },
      { id: 12, storyboardNumber: 2, videoUrl: null, composedVideoUrl: 'static/composed/b.mp4', mergeVideoUrl: 'static/composed/b.mp4' },
    ],
  })

  assert.deepEqual(record, {
    episodeId: 7,
    dramaId: 2,
    title: 'Episode 7 Merge',
    provider: 'ffmpeg',
    model: 'ffmpeg-concat-copy-fallback-transcode',
    status: 'processing',
    scenes: JSON.stringify([
      { storyboardId: 11, storyboardNumber: 1, videoUrl: 'static/videos/a.mp4', source: 'storyboard' },
      { storyboardId: 12, storyboardNumber: 2, videoUrl: 'static/composed/b.mp4', source: 'composed' },
    ]),
    createdAt: 't1',
  })
})

await runTest('merge state patch builders preserve episode export lifecycle fields', () => {
  assert.deepEqual(
    buildReplacedMergePatch('t2'),
    { status: 'replaced', mergedUrl: null, deletedAt: 't2' },
  )
  assert.deepEqual(
    buildEpisodeVideoClearPatch('t3'),
    { videoUrl: null, updatedAt: 't3' },
  )
  assert.deepEqual(
    buildMergeCompletionPatch({ mergedUrl: 'https://cos.example.com/merged/a.mp4', duration: 37, completedAt: 't4' }),
    { status: 'completed', mergedUrl: 'https://cos.example.com/merged/a.mp4', duration: 37, completedAt: 't4' },
  )
  assert.deepEqual(
    buildEpisodeVideoCompletionPatch('https://cos.example.com/merged/a.mp4', 't5'),
    { videoUrl: 'https://cos.example.com/merged/a.mp4', updatedAt: 't5' },
  )
  assert.deepEqual(
    buildMergeFailurePatch(new Error('ffmpeg failed')),
    { status: 'failed', errorMsg: 'ffmpeg failed' },
  )
})

await runTest('createMergeJobPersistence forwards merge state through injected dependencies', async () => {
  const calls: unknown[] = []
  const persistence = createMergeJobPersistence({
    loadEpisodeStoryboards: async (episodeId) => {
      calls.push({ action: 'load-storyboards', episodeId })
      return [{ id: 1, storyboardNumber: 1, videoUrl: 'static/videos/a.mp4', composedVideoUrl: null }]
    },
    loadPreviousEpisodeMerges: async (episodeId) => {
      calls.push({ action: 'load-previous', episodeId })
      return [{ id: 2, mergedUrl: 'static/merged/old.mp4' }]
    },
    updateEpisodeMerges: async (episodeId, patch) => {
      calls.push({ action: 'replace-merges', episodeId, patch })
    },
    updateEpisode: async (episodeId, patch) => {
      calls.push({ action: 'update-episode', episodeId, patch })
    },
    insertVideoMerge: async (record) => {
      calls.push({ action: 'insert-merge', record })
      return 99
    },
    updateVideoMerge: async (mergeId, patch) => {
      calls.push({ action: 'update-merge', mergeId, patch })
    },
  })

  assert.deepEqual(await persistence.loadEpisodeStoryboards(7), [
    { id: 1, storyboardNumber: 1, videoUrl: 'static/videos/a.mp4', composedVideoUrl: null },
  ])
  assert.deepEqual(await persistence.loadPreviousEpisodeMerges(7), [
    { id: 2, mergedUrl: 'static/merged/old.mp4' },
  ])
  await persistence.replaceEpisodeMerges(7, 't6')
  await persistence.clearEpisodeVideo(7, 't7')
  const mergeId = await persistence.createEpisodeMergeRecord({
    episodeId: 7,
    dramaId: 2,
    createdAt: 't8',
    storyboards: [{ id: 3, storyboardNumber: 3, videoUrl: 'static/videos/c.mp4', composedVideoUrl: null, mergeVideoUrl: 'static/videos/c.mp4' }],
  })
  await persistence.recordMergeFailure(mergeId, 'broken')
  await persistence.completeEpisodeMerge({
    mergeId,
    episodeId: 7,
    mergedUrl: 'static/merged/new.mp4',
    duration: 12,
    completedAt: 't9',
    episodeUpdatedAt: 't10',
  })

  assert.equal(mergeId, 99)
  assert.deepEqual(calls, [
    { action: 'load-storyboards', episodeId: 7 },
    { action: 'load-previous', episodeId: 7 },
    { action: 'replace-merges', episodeId: 7, patch: { status: 'replaced', mergedUrl: null, deletedAt: 't6' } },
    { action: 'update-episode', episodeId: 7, patch: { videoUrl: null, updatedAt: 't7' } },
    {
      action: 'insert-merge',
      record: {
        episodeId: 7,
        dramaId: 2,
        title: 'Episode 7 Merge',
        provider: 'ffmpeg',
        model: 'ffmpeg-concat-copy-fallback-transcode',
        status: 'processing',
        scenes: JSON.stringify([
          { storyboardId: 3, storyboardNumber: 3, videoUrl: 'static/videos/c.mp4', source: 'storyboard' },
        ]),
        createdAt: 't8',
      },
    },
    { action: 'update-merge', mergeId: 99, patch: { status: 'failed', errorMsg: 'broken' } },
    { action: 'update-merge', mergeId: 99, patch: { status: 'completed', mergedUrl: 'static/merged/new.mp4', duration: 12, completedAt: 't9' } },
    { action: 'update-episode', episodeId: 7, patch: { videoUrl: 'static/merged/new.mp4', updatedAt: 't10' } },
  ])
})
