import assert from 'node:assert/strict'

import {
  parseJsonArrayStringList,
  parseStoredStringList,
  resolveImageReference,
  resolveImageReferenceArray,
  resolveStoredImageReferences,
  resolveVideoOrAudioReference,
  resolveVideoGenerationReferences,
  stringifyStringList,
} from '../media/assets/media-reference-resolver.js'

function runTest(name: string, fn: () => void | Promise<void>) {
  Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`PASS ${name}`)
    })
    .catch((error) => {
      console.error(`FAIL ${name}`)
      throw error
    })
}

runTest('parseJsonArrayStringList only accepts stored JSON arrays', () => {
  assert.deepEqual(parseJsonArrayStringList('[" a ","","b","a"]'), ['a', 'b'])
  assert.deepEqual(parseJsonArrayStringList('"single"'), [])
  assert.deepEqual(parseJsonArrayStringList('a,b'), [])
  assert.deepEqual(parseJsonArrayStringList(null), [])
})

runTest('parseStoredStringList accepts arrays, JSON strings, JSON arrays, and comma lines', () => {
  assert.deepEqual(parseStoredStringList([' a ', 'b', 'a']), ['a', 'b'])
  assert.deepEqual(parseStoredStringList('"single"'), ['single'])
  assert.deepEqual(parseStoredStringList('["a","b","a"]'), ['a', 'b'])
  assert.deepEqual(parseStoredStringList('a,b\nc'), ['a', 'b', 'c'])
})

runTest('stringifyStringList stores normalized unique values or null', () => {
  assert.equal(stringifyStringList([' a ', '', 'a', 'b']), '["a","b"]')
  assert.equal(stringifyStringList(''), null)
})

runTest('resolveImageReference compresses local static images and keeps remote/data URLs', async () => {
  const calls: string[] = []
  const result = await resolveImageReference('/static/uploads/a.png', {
    readImageAsCompressedDataUrl: async (
      localPath: string,
      options: { maxWidth: number; maxHeight: number; quality: number },
    ) => {
      calls.push(`${localPath}:${options.maxWidth}x${options.maxHeight}:${options.quality}`)
      return 'data:image/jpeg;base64,compressed'
    },
  })

  assert.equal(result, 'data:image/jpeg;base64,compressed')
  assert.deepEqual(calls, ['static/uploads/a.png:768x768:68'])
  assert.equal(await resolveImageReference('data:image/png;base64,raw', {}), 'data:image/png;base64,raw')
  assert.equal(await resolveImageReference('https://cdn.example.com/a.png', {}), 'https://cdn.example.com/a.png')
})

runTest('resolveImageReference reports failed local reads and removes failed refs from arrays', async () => {
  const warnings: string[] = []
  const result = await resolveImageReferenceArray('["static/missing.png","https://cdn/a.png"]', {
    readImageAsCompressedDataUrl: async () => {
      throw new Error('file missing')
    },
    warn: (event: string, payload: { path: string; error: string }) => {
      warnings.push(`${event}:${payload.path}:${payload.error}`)
    },
  })

  assert.deepEqual(result, ['https://cdn/a.png'])
  assert.deepEqual(warnings, ['reference-read-failed:static/missing.png:file missing'])
})

runTest('resolveStoredImageReferences parses stored video image refs and preserves order after dedupe', async () => {
  const result = await resolveStoredImageReferences('static/a.png, https://cdn/b.png, static/a.png', {
    readImageAsCompressedDataUrl: async (localPath: string) => `data:image/jpeg;base64,${localPath}`,
  })

  assert.deepEqual(result, ['data:image/jpeg;base64,static/a.png', 'https://cdn/b.png'])
})

runTest('resolveVideoOrAudioReference publishes local static media and keeps remote/data refs', async () => {
  const calls: string[] = []
  const result = await resolveVideoOrAudioReference('/static/audio/a.mp3', {
    uploadStaticAssetToCos: async (localPath: string) => {
      calls.push(localPath)
      return 'https://cos.example.com/audio/a.mp3'
    },
  })

  assert.equal(result, 'https://cos.example.com/audio/a.mp3')
  assert.deepEqual(calls, ['static/audio/a.mp3'])
  assert.equal(await resolveVideoOrAudioReference('https://cdn.example.com/a.mp4', {}), 'https://cdn.example.com/a.mp4')
  assert.equal(await resolveVideoOrAudioReference('data:audio/mp3;base64,raw', {}), 'data:audio/mp3;base64,raw')
})

runTest('resolveVideoGenerationReferences resolves all video provider reference channels', async () => {
  const imageReads: string[] = []
  const mediaUploads: string[] = []

  const result = await resolveVideoGenerationReferences({
    imageUrl: '/static/images/cover.png',
    firstFrameUrl: 'https://cdn.example.com/first.png',
    lastFrameUrl: 'data:image/png;base64,last',
    referenceImageUrls: '["/static/images/ref-a.png","https://cdn.example.com/ref-b.png"]',
    referenceVideoUrls: 'static/videos/ref.mp4,https://cdn.example.com/ref.mp4',
    referenceAudioUrls: 'static/audio/ref.mp3',
  }, {
    readImageAsCompressedDataUrl: async (localPath: string) => {
      imageReads.push(localPath)
      return `data:image/jpeg;base64,${localPath}`
    },
    uploadStaticAssetToCos: async (localPath: string) => {
      mediaUploads.push(localPath)
      return `https://cos.example.com/${localPath}`
    },
  })

  assert.deepEqual(imageReads, ['static/images/cover.png', 'static/images/ref-a.png'])
  assert.deepEqual(mediaUploads, ['static/videos/ref.mp4', 'static/audio/ref.mp3'])
  assert.deepEqual(result, {
    imageUrl: 'data:image/jpeg;base64,static/images/cover.png',
    firstFrameUrl: 'https://cdn.example.com/first.png',
    lastFrameUrl: 'data:image/png;base64,last',
    referenceImageUrls: [
      'data:image/jpeg;base64,static/images/ref-a.png',
      'https://cdn.example.com/ref-b.png',
    ],
    referenceVideoUrls: [
      'https://cos.example.com/static/videos/ref.mp4',
      'https://cdn.example.com/ref.mp4',
    ],
    referenceAudioUrls: [
      'https://cos.example.com/static/audio/ref.mp3',
    ],
  })
})
