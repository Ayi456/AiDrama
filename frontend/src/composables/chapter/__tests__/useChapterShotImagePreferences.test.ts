import assert from 'node:assert/strict'

import { computed, nextTick, ref } from 'vue'

import type {
  ChapterCharacter,
  ChapterScene,
} from '../chapterMediaTypes.ts'
import { useChapterShotImagePreferences } from '../useChapterShotImagePreferences.ts'

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

function createMemoryStorage(initial: Record<string, string> = {}) {
  const rows = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => {
      rows.set(key, value)
    },
    value: (key: string) => rows.get(key) ?? null,
  }
}

runTest('shot image preferences restore and persist valid size choices', async () => {
  const storage = createMemoryStorage({
    'aidrama:shot-image-prefs:7:12': JSON.stringify({ aspectRatio: '9:16', sizePreset: '3K' }),
  })
  const prefs = useChapterShotImagePreferences({
    dramaId: 7,
    chapterNumber: 2,
    epId: computed(() => 12),
    chars: ref([]),
    scenes: ref([]),
    storage,
  })

  prefs.restoreShotImagePreferences()

  assert.equal(prefs.shotImageAspectRatio.value, '9:16')
  assert.equal(prefs.shotImageSizePreset.value, '3K')
  assert.equal(prefs.shotImageResolvedSize.value, '1728x3072')

  prefs.handleShotImageAspectRatioChange('4:3')
  prefs.handleShotImageSizePresetChange('2K')
  await nextTick()

  assert.equal(storage.value('aidrama:shot-image-prefs:7:12'), JSON.stringify({
    aspectRatio: '4:3',
    sizePreset: '2K',
  }))
})

runTest('shot image reference options preserve all image-bearing characters and scenes', () => {
  const prefs = useChapterShotImagePreferences({
    dramaId: 7,
    chapterNumber: 2,
    epId: computed(() => 0),
    chars: ref<ChapterCharacter[]>([
      { id: 1, name: 'Narrator', role: 'narrator', image_url: 'narrator.png' },
      { id: 2, name: 'Lead', character_asset_image_url: 'lead-asset.png', image_url: 'lead.png' },
      { id: 3, name: 'Support', imageUrl: 'support.png' },
    ]),
    scenes: ref<ChapterScene[]>([
      { id: 9, name: 'Atrium', image_url: 'atrium.png' },
      { id: 10, location: 'Roof' },
    ]),
  })

  assert.deepEqual(prefs.visualChars.value.map(char => char.id), [2, 3])
  assert.deepEqual(prefs.shotReferenceOptions.value.map(option => option.key), [
    'character-1',
    'character-asset-2',
    'character-2',
    'character-3',
    'scene-9',
  ])
  assert.deepEqual(prefs.shotReferenceOptions.value.map(option => option.src), [
    'narrator.png',
    'lead-asset.png',
    'lead.png',
    'support.png',
    'atrium.png',
  ])
})
