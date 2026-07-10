import { computed, ref, watch, type ComputedRef } from 'vue'

import type { ChapterStoryboard } from './chapterMediaTypes.ts'
import { removeKeyedValue, setKeyedValue } from './chapterVideoWorkbenchPolicy.ts'

export type VideoPromptDraftDependencies = {
  selectedShot: ComputedRef<ChapterStoryboard | null>
  selectedShotKey: ComputedRef<string>
  storyboards: () => ChapterStoryboard[]
  buildDefaultPrompt: (shot: ChapterStoryboard) => string
  savePrompt: (payload: { sb: ChapterStoryboard; field: string; value: string }) => Promise<unknown>
  reportError: (message: string) => void
}

function getShotVideoPrompt(shot: ChapterStoryboard | null | undefined) {
  return shot?.video_prompt || shot?.videoPrompt || ''
}

function setStoryboardVideoPrompt(storyboard: ChapterStoryboard | null | undefined, value: string) {
  if (!storyboard) return
  storyboard.video_prompt = value
  storyboard.videoPrompt = value
}

export function useChapterVideoPromptDrafts(deps: VideoPromptDraftDependencies) {
  const promptDraft = ref('')
  const promptDraftShotKey = ref('')
  const promptDraftsByShot = ref<Record<string, string>>({})
  const dirtyPromptDraftsByShot = ref<Record<string, boolean>>({})
  const savingPromptDraftsByShot = ref<Record<string, boolean>>({})
  const promptSavePromisesByShot = new Map<string, Promise<boolean>>()

  const isPromptSaving = computed(() => Boolean(savingPromptDraftsByShot.value[deps.selectedShotKey.value]))

  const getResolvedVideoPrompt = (shot: ChapterStoryboard) => (
    getShotVideoPrompt(shot) || deps.buildDefaultPrompt(shot)
  )

  function markPromptDraftDirty(value = promptDraft.value) {
    if (!deps.selectedShot.value) return
    const key = deps.selectedShotKey.value
    const nextValue = String(value ?? '')
    promptDraft.value = nextValue
    promptDraftShotKey.value = key
    promptDraftsByShot.value = setKeyedValue(promptDraftsByShot.value, key, nextValue)
    dirtyPromptDraftsByShot.value = setKeyedValue(dirtyPromptDraftsByShot.value, key, true)
  }

  watch(
    () => [
      deps.selectedShot.value?.id || 0,
      deps.selectedShot.value?.video_prompt || deps.selectedShot.value?.videoPrompt || '',
    ],
    () => {
      const shot = deps.selectedShot.value
      if (!shot) {
        promptDraftShotKey.value = ''
        promptDraft.value = ''
        return
      }
      const key = deps.selectedShotKey.value
      if (promptDraftShotKey.value !== key) {
        promptDraftShotKey.value = key
        promptDraft.value = dirtyPromptDraftsByShot.value[key]
          ? String(promptDraftsByShot.value[key] ?? '')
          : getResolvedVideoPrompt(shot)
        return
      }
      if (dirtyPromptDraftsByShot.value[key] || savingPromptDraftsByShot.value[key]) return
      promptDraft.value = getResolvedVideoPrompt(shot)
    },
    { immediate: true },
  )

  async function savePromptDraft(nextValue = promptDraft.value) {
    if (!deps.selectedShot.value) return false
    const shot = deps.selectedShot.value
    const key = deps.selectedShotKey.value
    const existingSave = promptSavePromisesByShot.get(key)
    if (existingSave) await existingSave.catch(() => false)

    const value = String(nextValue ?? '').trim()
    promptDraft.value = value
    promptDraftShotKey.value = key
    promptDraftsByShot.value = setKeyedValue(promptDraftsByShot.value, key, value)
    savingPromptDraftsByShot.value = setKeyedValue(savingPromptDraftsByShot.value, key, true)

    const savePromise = (async () => {
      await deps.savePrompt({ sb: shot, field: 'video_prompt', value })
      const latestShot = deps.selectedShot.value?.id === shot.id
        ? deps.selectedShot.value
        : deps.storyboards().find(item => item.id === shot.id)
      setStoryboardVideoPrompt(shot, value)
      setStoryboardVideoPrompt(latestShot, value)
      if (String(promptDraftsByShot.value[key] ?? '') === value) {
        dirtyPromptDraftsByShot.value = removeKeyedValue(dirtyPromptDraftsByShot.value, key)
        promptDraftsByShot.value = removeKeyedValue(promptDraftsByShot.value, key)
      }
      return true
    })()

    promptSavePromisesByShot.set(key, savePromise)
    try {
      return await savePromise
    } catch (error) {
      dirtyPromptDraftsByShot.value = setKeyedValue(dirtyPromptDraftsByShot.value, key, true)
      deps.reportError(error instanceof Error ? error.message : '视频提示词保存失败')
      return false
    } finally {
      if (promptSavePromisesByShot.get(key) === savePromise) {
        promptSavePromisesByShot.delete(key)
      }
      savingPromptDraftsByShot.value = removeKeyedValue(savingPromptDraftsByShot.value, key)
    }
  }

  function applyDefaultPrompt() {
    const shot = deps.selectedShot.value
    if (!shot) return
    const nextPrompt = deps.buildDefaultPrompt(shot)
    promptDraft.value = nextPrompt
    void savePromptDraft(nextPrompt)
  }

  return {
    promptDraft,
    isPromptSaving,
    markPromptDraftDirty,
    savePromptDraft,
    applyDefaultPrompt,
  }
}
