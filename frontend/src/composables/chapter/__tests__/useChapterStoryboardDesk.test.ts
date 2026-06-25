import assert from 'node:assert/strict'

import { computed, ref } from 'vue'

import type {
  ChapterStoryboard,
} from '../chapterMediaTypes.ts'
import { useChapterStoryboardDesk } from '../useChapterStoryboardDesk.ts'

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

await runTest('storyboard desk updates fields and keeps camel aliases in sync', async () => {
  const updates: Array<{ id: number; payload: Record<string, unknown> }> = []
  const storyboard: ChapterStoryboard = { id: 9, shot_type: 'wide', shotType: 'wide', character_ids: [1] }
  const desk = useChapterStoryboardDesk({
    epId: computed(() => 4),
    sbs: ref([storyboard]),
    chars: ref([{ id: 1, name: 'Lead' }, { id: 2, name: 'Support' }]),
    scenes: ref([]),
    selectedSb: ref(null),
    confirm: async () => true,
    refresh: async () => undefined,
    goSubStep: () => undefined,
    updateStoryboard: async (id, payload) => {
      updates.push({ id, payload })
    },
  })

  await desk.updateField(storyboard, 'shot_type', 'close')
  assert.equal(storyboard.shot_type, 'close')
  assert.equal(storyboard.shotType, 'close')
  assert.deepEqual(updates, [{ id: 9, payload: { shot_type: 'close' } }])

  await desk.updateField(storyboard, 'shot_type', 'close')
  assert.equal(updates.length, 1)

  assert.deepEqual(desk.getStoryboardCharacterNames(storyboard), ['Lead'])
  assert.equal(desk.isStoryboardCharacterSelected(storyboard, 2), false)
  await desk.toggleStoryboardCharacter(storyboard, 2)
  assert.deepEqual(storyboard.character_ids, [1, 2])
})

await runTest('storyboard desk handles scene labels and list actions', async () => {
  const created: Record<string, unknown>[] = []
  const deleted: number[] = []
  const selectedSb = ref<ChapterStoryboard | null>({ id: 1 })
  const sbs = ref<ChapterStoryboard[]>([{ id: 1 }, { id: 2, scene_id: 8 }])
  const opened: string[] = []
  const desk = useChapterStoryboardDesk({
    epId: computed(() => 4),
    sbs,
    chars: ref([]),
    scenes: ref([{ id: 8, location: 'Atrium', time: 'Night' }]),
    selectedSb,
    confirm: async () => true,
    refresh: async () => {
      sbs.value = [{ id: 2, scene_id: 8 }]
    },
    goSubStep: key => opened.push(key),
    createStoryboard: async payload => {
      created.push(payload)
    },
    deleteStoryboard: async id => {
      deleted.push(id)
    },
  })

  assert.equal(desk.getSceneName(sbs.value[1]), 'Atrium · Night')
  assert.equal(desk.getSceneName({ id: 3 }), '未绑定场景')

  desk.handleStoryboardOpen(sbs.value[1])
  assert.equal(selectedSb.value?.id, 2)
  assert.deepEqual(opened, ['prod:storyboard'])

  await desk.addShot()
  assert.deepEqual(created, [{
    episode_id: 4,
    storyboard_number: 3,
    title: '镜头3',
    duration: 10,
  }])

  await desk.deleteShot({ id: 1 })
  assert.deepEqual(deleted, [1])
  assert.equal(selectedSb.value?.id, 2)
})

await runTest('storyboard desk inserts a shot after the selected one and shifts the rest', async () => {
  const created: Record<string, unknown>[] = []
  const updates: Array<{ id: number; payload: Record<string, unknown> }> = []
  const sbs = ref<ChapterStoryboard[]>([
    { id: 1, storyboard_number: 1 },
    { id: 2, storyboard_number: 2 },
    { id: 3, storyboard_number: 3 },
  ])
  const selectedSb = ref<ChapterStoryboard | null>(sbs.value[0])
  const desk = useChapterStoryboardDesk({
    epId: computed(() => 7),
    sbs,
    chars: ref([]),
    scenes: ref([]),
    selectedSb,
    confirm: async () => true,
    refresh: async () => undefined,
    goSubStep: () => undefined,
    createStoryboard: async payload => {
      created.push(payload)
    },
    updateStoryboard: async (id, payload) => {
      updates.push({ id, payload })
    },
  })

  await desk.addShot()

  // 选中第 1 个镜头，新镜头序号为 2，后两个镜头从后往前顺延为 4、3。
  assert.deepEqual(updates, [
    { id: 3, payload: { storyboard_number: 4 } },
    { id: 2, payload: { storyboard_number: 3 } },
  ])
  assert.deepEqual(created, [{
    episode_id: 7,
    storyboard_number: 2,
    title: '镜头2',
    duration: 10,
  }])
})
