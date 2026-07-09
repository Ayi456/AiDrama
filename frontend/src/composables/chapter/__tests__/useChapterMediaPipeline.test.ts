import assert from 'node:assert/strict'

import { computed, ref } from 'vue'

import { useChapterMediaPipeline } from '../useChapterMediaPipeline.ts'
import type {
  ChapterCharacter,
  ChapterScene,
  ChapterStoryboard,
} from '../chapterMediaTypes.ts'

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

function createPipeline(input: {
  chars: ChapterCharacter[]
  scenes: ChapterScene[]
  sbs?: ChapterStoryboard[]
}) {
  return useChapterMediaPipeline({
    dramaId: 3,
    epId: computed(() => 12),
    chars: ref(input.chars),
    scenes: ref(input.scenes),
    sbs: ref(input.sbs || []),
    visualChars: computed(() => input.chars),
    selectedSb: ref(null),
    mergeData: ref(null),
    refresh: async () => {},
    lockedImageConfigId: computed(() => null),
    lockedVideoConfigId: computed(() => null),
    shotImageResolvedSize: computed(() => '2560x1440'),
    shotImageAspectRatio: ref('16:9'),
    updateField: () => {},
    getStoryboardCharacterIds: sb => sb.character_ids || sb.characterIds || [],
    getStoryboardCharacterNames: sb => (sb.character_ids || sb.characterIds || []).map(id => `Character ${id}`),
    getSceneName: sb => String(sb.scene_id || sb.sceneId || ''),
  })
}

runTest('shot reference images use replaced character image instead of stale bound asset', () => {
  const pipeline = createPipeline({
    chars: [
      { id: 7, name: 'Lead', character_asset_image_url: 'old-bound-asset.png', image_url: 'new-replaced.png' },
      { id: 8, name: 'Support', character_asset_image_url: 'support-asset.png' },
    ],
    scenes: [
      { id: 3, location: 'Atrium', image_url: 'atrium.png' },
    ],
  })

  assert.deepEqual(pipeline.getShotReferenceImages({
    id: 22,
    scene_id: 3,
    character_ids: [7, 8],
  }), [
    'atrium.png',
    'new-replaced.png',
    'support-asset.png',
  ])
})
