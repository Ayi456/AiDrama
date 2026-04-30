import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  bundledFfmpegCandidatePaths,
  bundledFfprobeCandidatePaths,
  escapeConcatPath,
  firstExistingPath,
} from '../ffmpeg.js'
import { ensureMergeInputFiles, type MergeInputFile, requireExistingMergeInputFiles } from '../merge-inputs.js'
import { selectMergeClipStoryboards } from '../merge-clips.js'
import { ffmpegMergeOutputOptions, ffmpegMergeStrategies, resolveFfmpegMergeTimeoutMs } from '../merge-ffmpeg-strategy.js'
import { isStaleProcessingMerge, resolveStaleMergeTimeoutMs } from '../merge-status.js'

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

await runTest('firstExistingPath returns first existing candidate', () => {
  const currentFile = fileURLToPath(import.meta.url)

  assert.equal(firstExistingPath([undefined, 'Z:/definitely/missing/ffmpeg.exe', currentFile]), currentFile)
})

await runTest('escapeConcatPath normalizes Windows separators and quotes', () => {
  assert.equal(
    escapeConcatPath("C:\\videos\\hero's cut.mp4"),
    "C:/videos/hero'\\''s cut.mp4",
  )
})

await runTest('bundled FFmpeg candidates include static npm package binaries for SCF', () => {
  const root = path.resolve('/var/user')
  assert.ok(
    bundledFfmpegCandidatePaths(root).includes(path.join(root, 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')),
  )
  assert.ok(
    bundledFfmpegCandidatePaths(root).includes(path.join(root, 'node_modules', '@ffmpeg-installer', `${process.platform}-${process.arch}`, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')),
  )
  assert.ok(
    bundledFfprobeCandidatePaths(root).includes(path.join(root, 'node_modules', 'ffprobe-static', 'bin', process.platform, process.arch, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')),
  )
  assert.ok(
    bundledFfprobeCandidatePaths(root).includes(path.join(root, 'node_modules', '@ffprobe-installer', `${process.platform}-${process.arch}`, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')),
  )
})

await runTest('selectMergeClipStoryboards prefers generated clips and falls back to legacy composed clips', () => {
  const clips = selectMergeClipStoryboards([
    { id: 1, storyboardNumber: 1, videoUrl: 'static/videos/a.mp4', composedVideoUrl: null },
    { id: 2, storyboardNumber: 2, videoUrl: 'static/videos/b.mp4', composedVideoUrl: 'static/composed/b.mp4' },
    { id: 3, storyboardNumber: 3, videoUrl: null, composedVideoUrl: 'static/composed/c.mp4' },
    { id: 4, storyboardNumber: 4, videoUrl: null, composedVideoUrl: null },
  ] as any)

  assert.deepEqual(
    clips.map(clip => ({ id: clip.id, mergeVideoUrl: clip.mergeVideoUrl })),
    [
      { id: 1, mergeVideoUrl: 'static/videos/a.mp4' },
      { id: 2, mergeVideoUrl: 'static/videos/b.mp4' },
      { id: 3, mergeVideoUrl: 'static/composed/c.mp4' },
    ],
  )
})

await runTest('selectMergeClipStoryboards filters by selected storyboard ids and preserves shot order', () => {
  const clips = selectMergeClipStoryboards([
    { id: 1, storyboardNumber: 1, videoUrl: 'static/videos/a.mp4', composedVideoUrl: null },
    { id: 2, storyboardNumber: 2, videoUrl: 'static/videos/b.mp4', composedVideoUrl: null },
    { id: 3, storyboardNumber: 3, videoUrl: 'static/videos/c.mp4', composedVideoUrl: null },
  ] as any, [3, 1])

  assert.deepEqual(
    clips.map(clip => ({ id: clip.id, mergeVideoUrl: clip.mergeVideoUrl })),
    [
      { id: 1, mergeVideoUrl: 'static/videos/a.mp4' },
      { id: 3, mergeVideoUrl: 'static/videos/c.mp4' },
    ],
  )
})

await runTest('requireExistingMergeInputFiles reports missing source videos before ffmpeg runs', () => {
  assert.throws(
    () => requireExistingMergeInputFiles([
      { sourceUrl: 'static/videos/a.mp4', localPath: 'C:/repo/data/static/videos/a.mp4' },
      { sourceUrl: 'static/videos/missing.mp4', localPath: 'C:/repo/data/static/videos/missing.mp4' },
    ], (filePath: string) => filePath.endsWith('/a.mp4')),
    /Missing merge input videos: static\/videos\/missing\.mp4 -> C:\/repo\/data\/static\/videos\/missing\.mp4/,
  )
})

await runTest('ensureMergeInputFiles restores missing remote source videos before ffmpeg runs', async () => {
  const existing = new Set<string>(['C:/repo/data/static/videos/a.mp4'])
  const downloads: string[] = []

  const files = await ensureMergeInputFiles([
    { sourceUrl: 'static/videos/a.mp4', localPath: 'C:/repo/data/static/videos/a.mp4' },
    { sourceUrl: 'https://cdn.example.com/videos/b.mp4', localPath: 'C:/repo/data/static/videos/b.mp4' },
  ], {
    exists: (filePath: string) => existing.has(filePath),
    download: async (input: MergeInputFile) => {
      downloads.push(`${input.sourceUrl} -> ${input.localPath}`)
      existing.add(input.localPath)
      return true
    },
  })

  assert.deepEqual(files, [
    'C:/repo/data/static/videos/a.mp4',
    'C:/repo/data/static/videos/b.mp4',
  ])
  assert.deepEqual(downloads, [
    'https://cdn.example.com/videos/b.mp4 -> C:/repo/data/static/videos/b.mp4',
  ])
})

await runTest('ensureMergeInputFiles restores missing videos with bounded concurrency', async () => {
  const existing = new Set<string>()
  let active = 0
  let maxActive = 0

  const files = await ensureMergeInputFiles([
    { sourceUrl: 'https://cdn.example.com/videos/a.mp4', localPath: 'C:/repo/data/static/videos/a.mp4' },
    { sourceUrl: 'https://cdn.example.com/videos/b.mp4', localPath: 'C:/repo/data/static/videos/b.mp4' },
    { sourceUrl: 'https://cdn.example.com/videos/c.mp4', localPath: 'C:/repo/data/static/videos/c.mp4' },
  ], {
    concurrency: 2,
    exists: (filePath: string) => existing.has(filePath),
    download: async (input: MergeInputFile) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setTimeout(resolve, 1))
      active -= 1
      existing.add(input.localPath)
      return true
    },
  })

  assert.equal(maxActive, 2)
  assert.equal(files.length, 3)
})

await runTest('ffmpeg merge strategies try stream copy before transcoding fallback', () => {
  assert.deepEqual(ffmpegMergeStrategies, ['copy', 'transcode'])
})

await runTest('stream-copy merge output options avoid expensive re-encoding', () => {
  const options = ffmpegMergeOutputOptions('copy')

  assert.ok(options.includes('-c'))
  assert.ok(options.includes('copy'))
  assert.ok(!options.includes('libx264'))
  assert.ok(!options.includes('aac'))
})

await runTest('transcode merge output options use faster fallback settings', () => {
  const options = ffmpegMergeOutputOptions('transcode')

  assert.ok(options.includes('libx264'))
  assert.equal(options[options.indexOf('-preset') + 1], 'veryfast')
  assert.ok(options.includes('aac'))
})

await runTest('ffmpeg merge timeout defaults below SCF request timeout and accepts overrides', () => {
  assert.equal(resolveFfmpegMergeTimeoutMs(), 14 * 60 * 1000)
  assert.equal(resolveFfmpegMergeTimeoutMs('60000'), 60_000)
  assert.equal(resolveFfmpegMergeTimeoutMs('bad'), 14 * 60 * 1000)
})

await runTest('processing merge records become stale after the configured timeout', () => {
  const createdAt = '2026-04-30T05:00:00.000Z'
  const nowMs = Date.parse('2026-04-30T05:31:00.000Z')

  assert.equal(resolveStaleMergeTimeoutMs(), 30 * 60 * 1000)
  assert.equal(isStaleProcessingMerge({ status: 'processing', createdAt }, nowMs), true)
  assert.equal(isStaleProcessingMerge({ status: 'completed', createdAt }, nowMs), false)
  assert.equal(isStaleProcessingMerge({ status: 'processing', createdAt: 'bad-date' }, nowMs), false)
})
