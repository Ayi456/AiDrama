import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import {
  SHOT_IMAGE_ASPECT_RATIO_OPTIONS,
  SHOT_IMAGE_SIZE_PRESET_OPTIONS,
  isShotImageAspectRatio,
  isShotImageSizePreset,
  resolveShotImageSize,
  type ShotImageAspectRatio,
  type ShotImageSizePreset,
} from '../../utils/shot-image-size.ts'
import type {
  ChapterCharacter,
  ChapterScene,
} from './chapterMediaTypes'

type ShotImagePreferenceStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

type ChapterShotImagePreferencesOptions = {
  dramaId: number
  chapterNumber: number
  epId: ComputedRef<number>
  chars: Ref<ChapterCharacter[]>
  scenes: Ref<ChapterScene[]>
  storage?: ShotImagePreferenceStorage | null
}

type ShotReferenceOption = {
  key: string
  type: 'character' | 'scene'
  src: string
  label: string
}

function defaultPreferenceStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function isNarratorCharacter(character: ChapterCharacter) {
  const text = `${character?.name || ''} ${character?.role || ''}`.toLowerCase()
  return text.includes('旁白') || text.includes('narrator') || text.includes('画外音')
}

export function useChapterShotImagePreferences(options: ChapterShotImagePreferencesOptions) {
  const frameMode = ref('first')
  const shotImageAspectRatio = ref<ShotImageAspectRatio>('16:9')
  const shotImageSizePreset = ref<ShotImageSizePreset>('2K')
  const preferenceStorage = options.storage === undefined ? defaultPreferenceStorage() : options.storage

  const frameModeOptions = [
    { label: '仅首帧', value: 'first' },
    { label: '首尾帧', value: 'first_last' },
  ]
  const shotImageAspectRatioOptions = SHOT_IMAGE_ASPECT_RATIO_OPTIONS.map(option => ({ ...option }))
  const shotImageSizePresetOptions = SHOT_IMAGE_SIZE_PRESET_OPTIONS.map(option => ({ ...option }))
  const shotImageResolvedSize = computed(() => resolveShotImageSize(shotImageAspectRatio.value, shotImageSizePreset.value))
  const shotImagePrefsKey = computed(() => `aidrama:shot-image-prefs:${options.dramaId}:${options.epId.value || options.chapterNumber}`)
  const visualChars = computed(() => options.chars.value.filter(character => !isNarratorCharacter(character)))
  const shotReferenceOptions = computed<ShotReferenceOption[]>(() => {
    const references: ShotReferenceOption[] = []
    options.chars.value.forEach((character) => {
      const assetSrc = character.character_asset_image_url || character.characterAssetImageUrl
      if (assetSrc) {
        references.push({
          key: `character-asset-${character.id}`,
          type: 'character',
          src: assetSrc,
          label: `${character.name || `角色 ${character.id}`} 形象`,
        })
      }
      const src = character.image_url || character.imageUrl
      if (src) {
        references.push({
          key: `character-${character.id}`,
          type: 'character',
          src,
          label: character.name || `角色 ${character.id}`,
        })
      }
    })
    options.scenes.value.forEach((scene) => {
      const src = scene.image_url || scene.imageUrl
      if (src) {
        references.push({
          key: `scene-${scene.id}`,
          type: 'scene',
          src,
          label: scene.name || scene.location || `场景 ${scene.id}`,
        })
      }
    })
    return references
  })

  function restoreShotImagePreferences() {
    if (!preferenceStorage) return
    try {
      const raw = preferenceStorage.getItem(shotImagePrefsKey.value)
      if (!raw) return
      const parsed = JSON.parse(raw) as { aspectRatio?: unknown; sizePreset?: unknown }
      if (isShotImageAspectRatio(parsed?.aspectRatio)) shotImageAspectRatio.value = parsed.aspectRatio
      if (isShotImageSizePreset(parsed?.sizePreset)) shotImageSizePreset.value = parsed.sizePreset
    } catch {}
  }

  function handleFrameModeChange(value: string) {
    frameMode.value = value
  }

  function handleShotImageAspectRatioChange(value: unknown) {
    if (!isShotImageAspectRatio(value)) return
    shotImageAspectRatio.value = value
  }

  function handleShotImageSizePresetChange(value: unknown) {
    if (!isShotImageSizePreset(value)) return
    shotImageSizePreset.value = value
  }

  watch([shotImageAspectRatio, shotImageSizePreset, shotImagePrefsKey], () => {
    if (!preferenceStorage) return
    try {
      preferenceStorage.setItem(shotImagePrefsKey.value, JSON.stringify({
        aspectRatio: shotImageAspectRatio.value,
        sizePreset: shotImageSizePreset.value,
      }))
    } catch {}
  })

  return {
    frameMode,
    frameModeOptions,
    shotImageAspectRatio,
    shotImageAspectRatioOptions,
    shotImageSizePreset,
    shotImageSizePresetOptions,
    shotImageResolvedSize,
    visualChars,
    shotReferenceOptions,
    restoreShotImagePreferences,
    handleFrameModeChange,
    handleShotImageAspectRatioChange,
    handleShotImageSizePresetChange,
  }
}
