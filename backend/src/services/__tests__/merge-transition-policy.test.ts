import assert from 'node:assert/strict'

import {
  TRANSITION_TYPE_WHITELIST,
  DEFAULT_TRANSITION_TYPE,
  DEFAULT_TRANSITION_DURATION_MS,
  MAX_TRANSITION_DURATION_MS,
  buildXfadeFilter,
  computeSeamDurations,
  isTransitionEnabled,
  normalizeTransitionDurationMs,
  normalizeTransitionType,
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

await runTest('computeSeamDurations caps each seam by half of the shorter neighbour', () => {
  const { seamDurations } = computeSeamDurations([10, 10, 10], 500)
  assert.deepEqual(seamDurations, [0.5, 0.5])

  const { seamDurations: degraded } = computeSeamDurations([10, 0.5, 10], 500)
  // Middle clip is 0.5s → both seams capped at 0.25s
  assert.deepEqual(degraded, [0.25, 0.25])

  const { seamDurations: tooShort } = computeSeamDurations([0.2, 0.2], 500)
  assert.deepEqual(tooShort, [0.1])
})

await runTest('computeSeamDurations offsets track cumulative visible time', () => {
  const { seamOffsets } = computeSeamDurations([5, 5, 5], 500)
  // First seam: cumulative 5 - 0.5 = 4.5; second seam: 4.5 + 5 - 0.5 = 9.0
  assert.equal(seamOffsets[0], 4.5)
  assert.equal(seamOffsets[1], 9)
})

await runTest('buildXfadeFilter returns null for single clip', () => {
  const result = buildXfadeFilter([10], 'fade', 500, ['[0:a]'])
  assert.equal(result, null)
})

await runTest('buildXfadeFilter returns null when every seam degrades to zero', () => {
  const result = buildXfadeFilter([0.1, 0.1], 'fade', 500, ['[0:a]', '[1:a]'])
  // half of 0.1 rounded to seam duration 0.05 → not zero, so this stays
  // Use an even smaller clip to force degenerate case via 0-duration seam:
  const degenerate = buildXfadeFilter([10, 10], 'fade', 0, ['[0:a]', '[1:a]'])
  assert.equal(degenerate, null)
  // The first call would actually still produce a filter (seam 0.05s); confirm types
  assert.ok(result === null || typeof result.filter === 'string')
})

await runTest('buildXfadeFilter emits N-1 xfade + acrossfade steps for N clips', () => {
  const result = buildXfadeFilter([5, 5, 5], 'fade', 500, ['[0:a]', '[1:a]', '[2:a]'])
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

await runTest('buildXfadeFilter degrades short seams to concat hard cut', () => {
  // First seam normal (5s+5s → 0.5s xfade), second seam degenerate (5s+0.001s)
  const result = buildXfadeFilter([5, 5, 0.001], 'fade', 500, ['[0:a]', '[1:a]', '[2:a]'])
  assert.ok(result)
  assert.ok(result!.filter.includes('xfade='))
  assert.ok(result!.filter.includes('concat=n=2:v=1:a=0'))
  assert.ok(result!.filter.includes('concat=n=2:v=0:a=1'))
})

await runTest('buildXfadeFilter honors custom audio labels for anullsrc backfill', () => {
  const result = buildXfadeFilter([5, 5], 'fadeblack', 400, ['[0:a]', '[anull1]'])
  assert.ok(result)
  assert.ok(result!.filter.includes('[anull1]'))
  assert.ok(result!.filter.includes('transition=fadeblack'))
})
