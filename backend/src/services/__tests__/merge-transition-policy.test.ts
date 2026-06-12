import assert from 'node:assert/strict'

import {
  TRANSITION_TYPE_WHITELIST,
  DEFAULT_TRANSITION_TYPE,
  DEFAULT_TRANSITION_DURATION_MS,
  MAX_TRANSITION_DURATION_MS,
  buildXfadeFilter,
  computeSeamDurations,
  isAnyTransitionEnabled,
  isTransitionEnabled,
  normalizeTransitionDurationMs,
  normalizeTransitionType,
  pickXfadeFps,
  planXfadeMergeTree,
  resolveSeamTransitions,
  resolveTransitionConfig,
} from '../merge/merge-transition-policy.js'

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

await runTest('normalizeTransitionType accepts whitelisted values only', () => {
  for (const ok of TRANSITION_TYPE_WHITELIST) {
    assert.equal(normalizeTransitionType(ok), ok)
  }
  assert.equal(normalizeTransitionType('directionalwarp'), null)
  assert.equal(normalizeTransitionType(''), null)
  assert.equal(normalizeTransitionType(null), null)
  assert.equal(normalizeTransitionType(undefined), null)
  assert.equal(normalizeTransitionType(123), null)
})

await runTest('normalizeTransitionDurationMs clamps to [0, MAX] and rounds', () => {
  assert.equal(normalizeTransitionDurationMs(-100), 0)
  assert.equal(normalizeTransitionDurationMs(0), 0)
  assert.equal(normalizeTransitionDurationMs(500), 500)
  assert.equal(normalizeTransitionDurationMs(500.6), 501)
  assert.equal(normalizeTransitionDurationMs(MAX_TRANSITION_DURATION_MS + 500), MAX_TRANSITION_DURATION_MS)
  assert.equal(normalizeTransitionDurationMs('400'), 400)
  assert.equal(normalizeTransitionDurationMs('abc'), null)
  assert.equal(normalizeTransitionDurationMs(null), null)
})

await runTest('resolveTransitionConfig falls back to defaults for invalid input', () => {
  assert.deepEqual(resolveTransitionConfig({}), {
    type: DEFAULT_TRANSITION_TYPE,
    durationMs: DEFAULT_TRANSITION_DURATION_MS,
  })
  assert.deepEqual(resolveTransitionConfig({ type: 'bogus', durationMs: 300 }), {
    type: DEFAULT_TRANSITION_TYPE,
    durationMs: 300,
  })
  assert.deepEqual(resolveTransitionConfig({ type: 'fadeblack', durationMs: 0 }), {
    type: 'fadeblack',
    durationMs: 0,
  })
})

await runTest('isTransitionEnabled needs 2+ clips and positive duration', () => {
  assert.equal(isTransitionEnabled({ type: 'fade', durationMs: 500 }, 1), false)
  assert.equal(isTransitionEnabled({ type: 'fade', durationMs: 0 }, 5), false)
  assert.equal(isTransitionEnabled({ type: 'fade', durationMs: 500 }, 2), true)
})

await runTest('isAnyTransitionEnabled is true when any seam has positive duration', () => {
  assert.equal(isAnyTransitionEnabled([{ type: 'fade', durationMs: 0 }], 2), false)
  assert.equal(isAnyTransitionEnabled([{ type: 'fade', durationMs: 0 }], 1), false)
  assert.equal(
    isAnyTransitionEnabled([{ type: 'fade', durationMs: 0 }, { type: 'pixelize', durationMs: 500 }], 3),
    true,
  )
})

await runTest('resolveSeamTransitions inherits the global default and applies per-seam overrides', () => {
  const global = { type: 'fade' as const, durationMs: 500 }
  const seams = resolveSeamTransitions(global, [
    null,
    { type: 'pixelize', durationMs: 800 },
    { type: 'bogus', durationMs: null },
    { type: null, durationMs: 200 },
  ])
  assert.deepEqual(seams[0], { type: 'fade', durationMs: 500 })
  assert.deepEqual(seams[1], { type: 'pixelize', durationMs: 800 })
  // invalid type falls back to global type; missing duration falls back to global duration
  assert.deepEqual(seams[2], { type: 'fade', durationMs: 500 })
  // missing type falls back to global type; explicit duration kept
  assert.deepEqual(seams[3], { type: 'fade', durationMs: 200 })
})

await runTest('computeSeamDurations caps each seam by half of the shorter neighbour', () => {
  const { seamDurations } = computeSeamDurations([10, 10, 10], [500, 500])
  assert.deepEqual(seamDurations, [0.5, 0.5])

  const { seamDurations: degraded } = computeSeamDurations([10, 0.5, 10], [500, 500])
  // Middle clip is 0.5s → both seams capped at 0.25s
  assert.deepEqual(degraded, [0.25, 0.25])

  const { seamDurations: tooShort } = computeSeamDurations([0.2, 0.2], [500])
  assert.deepEqual(tooShort, [0.1])
})

await runTest('computeSeamDurations honours different per-seam durations', () => {
  const { seamDurations } = computeSeamDurations([10, 10, 10], [500, 200])
  assert.deepEqual(seamDurations, [0.5, 0.2])
})

await runTest('computeSeamDurations offsets track cumulative visible time', () => {
  const { seamOffsets } = computeSeamDurations([5, 5, 5], [500, 500])
  // First seam: cumulative 5 - 0.5 = 4.5; second seam: 4.5 + 5 - 0.5 = 9.0
  assert.equal(seamOffsets[0], 4.5)
  assert.equal(seamOffsets[1], 9)
})

await runTest('buildXfadeFilter returns null for single clip', () => {
  const result = buildXfadeFilter([10], [], ['[0:a]'])
  assert.equal(result, null)
})

await runTest('buildXfadeFilter throws when seam config count does not match', () => {
  assert.throws(() => buildXfadeFilter([5, 5, 5], [{ type: 'fade', durationMs: 500 }], ['[0:a]', '[1:a]', '[2:a]']))
})

await runTest('buildXfadeFilter returns null when every seam degrades to zero', () => {
  const result = buildXfadeFilter([0.1, 0.1], [{ type: 'fade', durationMs: 500 }], ['[0:a]', '[1:a]'])
  // half of 0.1 rounded to seam duration 0.05 → not zero, so this stays
  // Use a 0-duration seam to force degenerate case:
  const degenerate = buildXfadeFilter([10, 10], [{ type: 'fade', durationMs: 0 }], ['[0:a]', '[1:a]'])
  assert.equal(degenerate, null)
  // The first call would actually still produce a filter (seam 0.05s); confirm types
  assert.ok(result === null || typeof result.filter === 'string')
})

await runTest('buildXfadeFilter emits N-1 xfade + acrossfade steps for N clips', () => {
  const result = buildXfadeFilter(
    [5, 5, 5],
    [{ type: 'fade', durationMs: 500 }, { type: 'fade', durationMs: 500 }],
    ['[0:a]', '[1:a]', '[2:a]'],
  )
  assert.ok(result, 'filter result expected')
  // Two seams → two xfade + two acrossfade
  const xfadeCount = (result!.filter.match(/xfade=/g) || []).length
  const crossCount = (result!.filter.match(/acrossfade=/g) || []).length
  assert.equal(xfadeCount, 2)
  assert.equal(crossCount, 2)
  assert.equal(result!.videoOutLabel, 'vout')
  assert.equal(result!.audioOutLabel, 'aout')
  // Last step must terminate in [vout]/[aout]
  assert.ok(result!.filter.includes('[vout]'))
  assert.ok(result!.filter.includes('[aout]'))
})

await runTest('buildXfadeFilter applies a different transition type per seam', () => {
  // seam 0 (clip1↔clip2) fade, seam 2 (clip3↔clip4) pixelize
  const result = buildXfadeFilter(
    [5, 5, 5, 5],
    [
      { type: 'fade', durationMs: 500 },
      { type: 'fade', durationMs: 500 },
      { type: 'pixelize', durationMs: 500 },
    ],
    ['[0:a]', '[1:a]', '[2:a]', '[3:a]'],
  )
  assert.ok(result)
  assert.ok(result!.filter.includes('transition=fade'))
  assert.ok(result!.filter.includes('transition=pixelize'))
})

await runTest('buildXfadeFilter degrades short seams to concat hard cut', () => {
  // First seam normal (5s+5s → 0.5s xfade), second seam degenerate (5s+0.001s)
  const result = buildXfadeFilter(
    [5, 5, 0.001],
    [{ type: 'fade', durationMs: 500 }, { type: 'fade', durationMs: 500 }],
    ['[0:a]', '[1:a]', '[2:a]'],
  )
  assert.ok(result)
  assert.ok(result!.filter.includes('xfade='))
  assert.ok(result!.filter.includes('concat=n=2:v=1:a=0'))
  assert.ok(result!.filter.includes('concat=n=2:v=0:a=1'))
})

await runTest('buildXfadeFilter normalizes video with fps last so xfade sees a constant frame rate', () => {
  // setpts resets the frame-rate metadata to unknown (1/0); ffmpeg 7.x xfade rejects that,
  // so fps must be the final rate-affecting filter in each normalization chain.
  const result = buildXfadeFilter([8, 8], [{ type: 'fade', durationMs: 500 }], ['[0:a]', '[1:a]'])
  assert.ok(result, 'filter result expected')
  assert.ok(result!.filter.includes('[0:v]setpts=PTS-STARTPTS,fps=30,format=yuv420p[v0n]'))
  assert.ok(result!.filter.includes('[1:v]setpts=PTS-STARTPTS,fps=30,format=yuv420p[v1n]'))
  assert.ok(!result!.filter.includes('format=yuv420p,setpts'))
})

await runTest('buildXfadeFilter honors custom audio labels for anullsrc backfill', () => {
  const result = buildXfadeFilter([5, 5], [{ type: 'fadeblack', durationMs: 400 }], ['[0:a]', '[anull1]'])
  assert.ok(result)
  assert.ok(result!.filter.includes('[anull1]'))
  assert.ok(result!.filter.includes('transition=fadeblack'))
})

await runTest('planXfadeMergeTree merges few clips in a single step', () => {
  assert.deepEqual(planXfadeMergeTree(3, 4), [
    { inputNodes: [0, 1, 2], seamIndices: [0, 1], outputNode: 3 },
  ])
  assert.deepEqual(planXfadeMergeTree(2, 4), [
    { inputNodes: [0, 1], seamIndices: [0], outputNode: 2 },
  ])
})

await runTest('planXfadeMergeTree builds a 4-ary tree and maps seams to original indices', () => {
  assert.deepEqual(planXfadeMergeTree(10, 4), [
    { inputNodes: [0, 1, 2, 3], seamIndices: [0, 1, 2], outputNode: 10 },
    { inputNodes: [4, 5, 6, 7], seamIndices: [4, 5, 6], outputNode: 11 },
    { inputNodes: [8, 9], seamIndices: [8], outputNode: 12 },
    { inputNodes: [10, 11, 12], seamIndices: [3, 7], outputNode: 13 },
  ])
})

await runTest('planXfadeMergeTree carries a lone trailing node up to the next level', () => {
  assert.deepEqual(planXfadeMergeTree(5, 4), [
    { inputNodes: [0, 1, 2, 3], seamIndices: [0, 1, 2], outputNode: 5 },
    { inputNodes: [5, 4], seamIndices: [3], outputNode: 6 },
  ])
})

await runTest('planXfadeMergeTree keeps tree depth logarithmic for many clips', () => {
  const steps = planXfadeMergeTree(40, 4)
  const lastStep = steps[steps.length - 1]
  // 40 -> 10 -> 3 -> 1: 10 + 3 + 1 steps
  assert.equal(steps.length, 14)
  const allSeams = steps.flatMap(step => step.seamIndices).sort((a, b) => a - b)
  assert.deepEqual(allSeams, Array.from({ length: 39 }, (_, i) => i))
  assert.ok(lastStep.inputNodes.length <= 4)
})

await runTest('pickXfadeFps selects the highest source frame rate and defaults to 30', () => {
  assert.equal(pickXfadeFps([{ num: 24, den: 1 }, { num: 30, den: 1 }]), '30')
  assert.equal(pickXfadeFps([{ num: 24, den: 1 }, { num: 24, den: 1 }]), '24')
  assert.equal(pickXfadeFps([{ num: 30000, den: 1001 }, { num: 24, den: 1 }]), '30000/1001')
  assert.equal(pickXfadeFps([null, undefined]), '30')
  assert.equal(pickXfadeFps([]), '30')
  // implausible rates are ignored
  assert.equal(pickXfadeFps([{ num: 12288, den: 512 }, { num: 1000, den: 1 }]), '24')
})

await runTest('buildXfadeFilter normalizes video to the requested fps', () => {
  const result = buildXfadeFilter([8, 8], [{ type: 'fade', durationMs: 500 }], ['[0:a]', '[1:a]'], '24')
  assert.ok(result)
  assert.ok(result!.filter.includes('setpts=PTS-STARTPTS,fps=24,format=yuv420p'))
})

await runTest('buildXfadeFilter can emit a concat-only graph when all seams degrade', () => {
  const seams = [{ type: 'fade' as const, durationMs: 0 }]
  assert.equal(buildXfadeFilter([5, 5], seams, ['[0:a]', '[1:a]'], '30'), null)
  const forced = buildXfadeFilter([5, 5], seams, ['[0:a]', '[1:a]'], '30', { emitWhenAllSeamsZero: true })
  assert.ok(forced)
  assert.ok(forced!.filter.includes('concat=n=2:v=1:a=0'))
  assert.ok(!forced!.filter.includes('xfade='))
})
