import type { ComputedRef, Ref } from 'vue'
import { storyboardAPI } from '../useApi.ts'
import type {
  ChapterCharacter,
  ChapterScene,
  ChapterStoryboard,
} from './chapterMediaTypes'

type StoryboardPayload = Record<string, unknown>

type ConfirmDelete = (options: {
  title: string
  message: string
  confirmText: string
  variant: string
}) => Promise<boolean>

type ChapterStoryboardDeskOptions = {
  epId: ComputedRef<number>
  sbs: Ref<ChapterStoryboard[]>
  chars: Ref<ChapterCharacter[]>
  scenes: Ref<ChapterScene[]>
  selectedSb: Ref<ChapterStoryboard | null>
  confirm: ConfirmDelete
  refresh: () => Promise<void>
  goSubStep: (key: string) => void
  createStoryboard?: (payload: StoryboardPayload) => Promise<unknown> | unknown
  updateStoryboard?: (id: number, payload: StoryboardPayload) => Promise<unknown> | unknown
  deleteStoryboard?: (id: number) => Promise<unknown> | unknown
}

function toCamel(field: string) {
  return field.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())
}

export function useChapterStoryboardDesk(options: ChapterStoryboardDeskOptions) {
  const createStoryboard = options.createStoryboard || ((payload: StoryboardPayload) => storyboardAPI.create(payload))
  const updateStoryboard = options.updateStoryboard || ((id: number, payload: StoryboardPayload) => storyboardAPI.update(id, payload))
  const deleteStoryboard = options.deleteStoryboard || ((id: number) => storyboardAPI.del(id))

  function updateField(storyboard: ChapterStoryboard, field: string, value: unknown) {
    const camelField = toCamel(field)
    const current = storyboard[field] ?? storyboard[camelField]
    if (current === value) return Promise.resolve()
    storyboard[field] = value
    if (camelField !== field) storyboard[camelField] = value
    return updateStoryboard(Number(storyboard.id), { [field]: value })
  }

  function getStoryboardCharacterIds(storyboard: ChapterStoryboard | null | undefined) {
    return storyboard?.character_ids || storyboard?.characterIds || []
  }

  function getStoryboardCharacterNames(storyboard: ChapterStoryboard | null | undefined) {
    const ids = getStoryboardCharacterIds(storyboard)
    return options.chars.value.filter(character => ids.includes(Number(character.id))).map(character => character.name)
  }

  function isStoryboardCharacterSelected(storyboard: ChapterStoryboard | null | undefined, charId: number) {
    return getStoryboardCharacterIds(storyboard).includes(charId)
  }

  function toggleStoryboardCharacter(storyboard: ChapterStoryboard, charId: number) {
    const currentIds = getStoryboardCharacterIds(storyboard)
    const nextIds = currentIds.includes(charId)
      ? currentIds.filter(id => id !== charId)
      : [...currentIds, charId]
    return updateField(storyboard, 'character_ids', nextIds)
  }

  function getSceneName(storyboard: ChapterStoryboard | null | undefined) {
    const sceneId = storyboard?.scene_id || storyboard?.sceneId
    if (!sceneId) return '未绑定场景'
    const scene = options.scenes.value.find(item => item.id === sceneId)
    return scene ? `${scene.location} · ${scene.time || '未设时间'}` : `场景 #${sceneId}`
  }

  function getStoryboardNumber(storyboard: ChapterStoryboard | null | undefined, fallback: number) {
    const value = Number(storyboard?.storyboard_number ?? storyboard?.storyboardNumber)
    return Number.isFinite(value) ? value : fallback
  }

  async function addShot() {
    const list = options.sbs.value
    const selected = options.selectedSb.value
    const idx = selected ? list.findIndex(item => item === selected || item.id === selected.id) : -1

    if (idx === -1) {
      await createStoryboard({
        episode_id: options.epId.value,
        storyboard_number: list.length + 1,
        title: `镜头${list.length + 1}`,
        duration: 10,
      })
      await options.refresh()
      return
    }

    // 在当前镜头之后插入：先把其后的镜头序号整体顺延 +1（从后往前更新避免序号冲突）。
    for (let i = list.length - 1; i > idx; i--) {
      const next = getStoryboardNumber(list[i], i + 1)
      await updateStoryboard(Number(list[i].id), { storyboard_number: next + 1 })
    }

    const insertNumber = getStoryboardNumber(list[idx], idx + 1) + 1
    await createStoryboard({
      episode_id: options.epId.value,
      storyboard_number: insertNumber,
      title: `镜头${insertNumber}`,
      duration: 10,
    })
    await options.refresh()
  }

  async function deleteShot(storyboard: ChapterStoryboard) {
    const ok = await options.confirm({
      title: '删除镜头',
      message: '确定删除此镜头？',
      confirmText: '删除',
      variant: 'danger',
    })
    if (!ok) return
    const index = Math.max(0, options.sbs.value.findIndex(item => item === storyboard || item.id === storyboard.id))
    await deleteStoryboard(Number(storyboard.id))
    await options.refresh()
    if (options.sbs.value.length) options.selectedSb.value = options.sbs.value[Math.min(index, options.sbs.value.length - 1)]
    else options.selectedSb.value = null
  }

  function handleShotSelection(storyboard: ChapterStoryboard) {
    options.selectedSb.value = storyboard
  }

  function handleStoryboardOpen(storyboard: ChapterStoryboard) {
    options.selectedSb.value = storyboard
    options.goSubStep('prod:storyboard')
  }

  function handleShotFieldUpdate(payload: { sb?: ChapterStoryboard; field?: string; value?: unknown } | null | undefined) {
    if (!payload?.sb || !payload?.field) return
    return updateField(payload.sb, payload.field, payload.value)
  }

  return {
    toCamel,
    updateField,
    getStoryboardCharacterIds,
    getStoryboardCharacterNames,
    isStoryboardCharacterSelected,
    toggleStoryboardCharacter,
    getSceneName,
    addShot,
    deleteShot,
    handleShotSelection,
    handleStoryboardOpen,
    handleShotFieldUpdate,
  }
}
