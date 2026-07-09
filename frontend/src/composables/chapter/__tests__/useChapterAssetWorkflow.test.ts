import assert from 'node:assert/strict'

import { computed, ref } from 'vue'

import { characterAPI, uploadAPI } from '../../useApi.ts'
import {
  mergeCharacterImageReplacements,
  useChapterAssetWorkflow,
  type CharacterImageReplacement,
} from '../useChapterAssetWorkflow.ts'
import type { ChapterCharacter } from '../chapterMediaTypes.ts'

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

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

runTest('character image replacements survive stale refresh rows', () => {
  const staleRefreshRows: ChapterCharacter[] = [
    { id: 1, name: 'Lead', image_url: 'old-lead.png', imageUrl: 'old-lead.png', local_path: 'old-lead-path' },
    { id: 2, name: 'Support', image_url: 'old-support.png', imageUrl: 'old-support.png' },
  ]
  const replacements = new Map<number, CharacterImageReplacement>([
    [1, { imageUrl: 'new-lead.png', localPath: 'new-lead-path' }],
    [2, { imageUrl: 'new-support.png', localPath: 'new-support-path' }],
  ])

  const merged = mergeCharacterImageReplacements(staleRefreshRows, replacements)

  assert.deepEqual(merged.map(character => ({
    id: character.id,
    image_url: character.image_url,
    imageUrl: character.imageUrl,
    local_path: character.local_path,
    localPath: character.localPath,
  })), [
    {
      id: 1,
      image_url: 'new-lead.png',
      imageUrl: 'new-lead.png',
      local_path: 'new-lead-path',
      localPath: 'new-lead-path',
    },
    {
      id: 2,
      image_url: 'new-support.png',
      imageUrl: 'new-support.png',
      local_path: 'new-support-path',
      localPath: 'new-support-path',
    },
  ])
})

runTest('character image replacements leave unrelated refresh rows unchanged', () => {
  const staleRefreshRows: ChapterCharacter[] = [
    { id: 1, name: 'Lead', image_url: 'old-lead.png' },
    { id: 3, name: 'Other', image_url: 'other.png' },
  ]
  const replacements = new Map<number, CharacterImageReplacement>([
    [1, { imageUrl: 'new-lead.png', localPath: 'new-lead-path' }],
  ])

  const merged = mergeCharacterImageReplacements(staleRefreshRows, replacements)

  assert.equal(merged[0]?.image_url, 'new-lead.png')
  assert.equal(merged[1], staleRefreshRows[1])
})

runTest('concurrent character replacements keep newer local images after a stale refresh resolves last', async () => {
  const originalUploadImage = uploadAPI.image
  const originalCharacterUpdate = characterAPI.update
  const chars = ref<ChapterCharacter[]>([
    { id: 1, name: 'Lead', image_url: 'old-lead.png', imageUrl: 'old-lead.png' },
    { id: 2, name: 'Support', image_url: 'old-support.png', imageUrl: 'old-support.png' },
  ])
  let refreshCalls = 0
  const firstRefreshStarted = deferred()
  const firstRefreshCanFinish = deferred()

  uploadAPI.image = async (file: File) => ({
    url: `new-${file.name}.png`,
    path: `new-${file.name}-path`,
  })
  characterAPI.update = async () => ({})

  try {
    const workflow = useChapterAssetWorkflow({
      epId: computed(() => 12),
      chars,
      scenes: ref([]),
      visualChars: computed(() => chars.value),
      refresh: async () => {
        refreshCalls += 1
        if (refreshCalls === 1) {
          firstRefreshStarted.resolve()
          await firstRefreshCanFinish.promise
          chars.value = [
            { id: 1, name: 'Lead', image_url: 'new-lead.png', imageUrl: 'new-lead.png' },
            { id: 2, name: 'Support', image_url: 'old-support.png', imageUrl: 'old-support.png' },
          ]
          return
        }
        chars.value = [
          { id: 1, name: 'Lead', image_url: 'new-lead.png', imageUrl: 'new-lead.png' },
          { id: 2, name: 'Support', image_url: 'new-support.png', imageUrl: 'new-support.png' },
        ]
      },
      watchAsyncResult: () => {},
      waitForImageGeneration: async () => {},
      waitForImageAssetUpdate: async () => true,
    })

    const firstReplace = workflow.replaceCharImage({
      character: chars.value[0],
      file: { name: 'lead', type: 'image/png' } as File,
    })
    await firstRefreshStarted.promise
    const secondReplace = workflow.replaceCharImage({
      character: chars.value[1],
      file: { name: 'support', type: 'image/png' } as File,
    })

    await secondReplace
    assert.deepEqual(chars.value.map(character => character.image_url), ['new-lead.png', 'new-support.png'])

    firstRefreshCanFinish.resolve()
    await firstReplace

    assert.deepEqual(chars.value.map(character => character.image_url), ['new-lead.png', 'new-support.png'])
  } finally {
    uploadAPI.image = originalUploadImage
    characterAPI.update = originalCharacterUpdate
  }
})
