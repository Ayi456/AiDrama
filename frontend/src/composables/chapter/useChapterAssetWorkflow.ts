import { ref, type ComputedRef, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import { characterAPI, sceneAPI, uploadAPI } from '@/composables/useApi'
import type {
  ChapterCharacter,
  ChapterScene,
  ReplaceCharacterImagePayload,
  ReplaceSceneImagePayload,
  SceneReferenceImagePayload,
} from './chapterMediaTypes'
import { errorMessageFromUnknown } from './chapterMediaTypes'

type ImageAssetMonitor = {
  watchAsyncResult: (check: () => boolean, attempts?: number, delay?: number) => void
  waitForImageGeneration: (generationId: number) => Promise<void>
  waitForImageAssetUpdate: (
    readImage: () => string | null | undefined,
    previousImage: string | null | undefined,
    attempts?: number,
    delay?: number,
  ) => Promise<boolean>
}

type ChapterAssetWorkflowOptions = ImageAssetMonitor & {
  epId: ComputedRef<number>
  chars: Ref<ChapterCharacter[]>
  scenes: Ref<ChapterScene[]>
  visualChars: ComputedRef<ChapterCharacter[]>
  refresh: () => Promise<void>
}

export type CharacterImageReplacement = {
  imageUrl: string
  localPath?: string
}

export function mergeCharacterImageReplacements(
  characters: ChapterCharacter[],
  replacements: Map<number, CharacterImageReplacement>,
) {
  if (!replacements.size) return characters

  return characters.map((character) => {
    const id = Number(character?.id || 0)
    const replacement = id ? replacements.get(id) : null
    if (!replacement?.imageUrl) return character

    return {
      ...character,
      image_url: replacement.imageUrl,
      imageUrl: replacement.imageUrl,
      local_path: replacement.localPath,
      localPath: replacement.localPath,
    }
  })
}

export function useChapterAssetWorkflow(options: ChapterAssetWorkflowOptions) {
  const pendingCharImageIds = ref<number[]>([])
  const pendingSceneImageIds = ref<number[]>([])
  const replacingCharacterImageIds = ref<number[]>([])
  const replacingSceneImageIds = ref<number[]>([])
  const uploadingSceneReferenceIds = ref<number[]>([])
  const characterImageReplacements = new Map<number, CharacterImageReplacement>()

  function applyCharacterImageReplacements() {
    options.chars.value = mergeCharacterImageReplacements(options.chars.value, characterImageReplacements)
  }

  function isPendingCharImage(id: number) {
    return pendingCharImageIds.value.includes(id)
  }

  function isPendingSceneImage(id: number) {
    return pendingSceneImageIds.value.includes(id)
  }

  function isReplacingCharacterImage(id: number) {
    return replacingCharacterImageIds.value.includes(id)
  }

  function isReplacingSceneImage(id: number) {
    return replacingSceneImageIds.value.includes(id)
  }

  function isUploadingSceneReference(id: number) {
    return uploadingSceneReferenceIds.value.includes(id)
  }

  function hasCharacterImage(char: ChapterCharacter | null | undefined) {
    return !!(char?.image_url || char?.imageUrl)
  }

  function hasSceneImage(scene: ChapterScene | null | undefined) {
    return !!(scene?.image_url || scene?.imageUrl)
  }

  function hasSceneReferenceImage(scene: ChapterScene | null | undefined) {
    return !!(scene?.reference_image || scene?.referenceImage)
  }

  function getImageGenerateButtonLabel(hasImage: boolean, pending: boolean) {
    if (pending) return '生成中'
    return hasImage ? '重新生成' : '生成'
  }

  function getImageGenerateToastLabel(hasImage: boolean, assetLabel: string) {
    return `${assetLabel}${hasImage ? '重新生成' : '生成'}中`
  }

  async function genCharImg(id: number) {
    const char = options.chars.value.find(c => c.id === id)
    const previousImage = char?.image_url || char?.imageUrl || ''
    const isReroll = hasCharacterImage(char)
    try {
      if (!isPendingCharImage(id)) pendingCharImageIds.value.push(id)
      const res = await characterAPI.generateImage(id, options.epId.value)
      toast.success(getImageGenerateToastLabel(isReroll, '角色图片'))
      const generationId = Number(res?.image_generation_id || res?.imageGenerationId || 0)
      if (generationId) {
        await options.waitForImageGeneration(generationId)
        await options.waitForImageAssetUpdate(() => {
          const current = options.chars.value.find(item => item.id === id)
          return current?.image_url || current?.imageUrl || ''
        }, previousImage, 12, 1000)
      } else {
        await options.waitForImageAssetUpdate(() => {
          const current = options.chars.value.find(item => item.id === id)
          return current?.image_url || current?.imageUrl || ''
        }, previousImage)
      }
      pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
    } catch (error: unknown) {
      pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
      toast.error(errorMessageFromUnknown(error))
    }
  }

  async function replaceCharImage(payload: ReplaceCharacterImagePayload) {
    const character = payload?.character
    const file = payload?.file
    if (!character?.id || !file) return
    if (!file.type?.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }

    const id = Number(character.id)
    try {
      if (!isReplacingCharacterImage(id)) replacingCharacterImageIds.value.push(id)
      const uploaded = await uploadAPI.image(file)
      await characterAPI.update(id, {
        image_url: uploaded.url,
        local_path: uploaded.path,
      })
      characterImageReplacements.set(id, {
        imageUrl: uploaded.url,
        localPath: uploaded.path,
      })
      applyCharacterImageReplacements()
      toast.success('角色图片已替换')
      await options.refresh()
      applyCharacterImageReplacements()
    } catch (error: unknown) {
      toast.error(errorMessageFromUnknown(error, '角色图片替换失败'))
    } finally {
      replacingCharacterImageIds.value = replacingCharacterImageIds.value.filter(item => item !== id)
    }
  }

  function batchCharImages() {
    const ids = options.visualChars.value
      .filter(c => !(c.image_url || c.imageUrl))
      .map(c => Number(c.id))
      .filter(Number.isFinite)
    if (!ids.length) {
      toast.info('所有角色图片已生成')
      return
    }
    pendingCharImageIds.value = [...new Set([...pendingCharImageIds.value, ...ids])]
    characterAPI.batchImages(ids, options.epId.value).then(async () => {
      toast.success('角色图片批量生成中')
      await options.refresh()
      options.watchAsyncResult(() => ids.every(id => {
        const char = options.chars.value.find(c => c.id === id)
        const done = !!(char?.image_url || char?.imageUrl)
        if (done) pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
        return done
      }), 36)
    }).catch((error: unknown) => {
      pendingCharImageIds.value = pendingCharImageIds.value.filter(item => !ids.includes(item))
      toast.error(errorMessageFromUnknown(error))
    })
  }

  async function genSceneImg(id: number) {
    const scene = options.scenes.value.find(s => s.id === id)
    const previousImage = scene?.image_url || scene?.imageUrl || ''
    const isReroll = hasSceneImage(scene)
    try {
      if (!isPendingSceneImage(id)) pendingSceneImageIds.value.push(id)
      const res = await sceneAPI.generateImage(id, options.epId.value)
      toast.success(getImageGenerateToastLabel(isReroll, '场景图片'))
      const generationId = Number(res?.image_generation_id || res?.imageGenerationId || 0)
      if (generationId) {
        await options.waitForImageGeneration(generationId)
        await options.waitForImageAssetUpdate(() => {
          const current = options.scenes.value.find(item => item.id === id)
          return current?.image_url || current?.imageUrl || ''
        }, previousImage, 12, 1000)
      } else {
        await options.waitForImageAssetUpdate(() => {
          const current = options.scenes.value.find(item => item.id === id)
          return current?.image_url || current?.imageUrl || ''
        }, previousImage)
      }
      pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
    } catch (error: unknown) {
      pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
      toast.error(errorMessageFromUnknown(error))
    }
  }

  async function replaceSceneImage(payload: ReplaceSceneImagePayload) {
    const scene = payload?.scene
    const file = payload?.file
    if (!scene?.id || !file) return
    if (!file.type?.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }

    const id = Number(scene.id)
    try {
      if (!isReplacingSceneImage(id)) replacingSceneImageIds.value.push(id)
      const uploaded = await uploadAPI.image(file)
      await sceneAPI.update(id, {
        image_url: uploaded.url,
        local_path: uploaded.path,
        status: 'completed',
      })
      scene.image_url = uploaded.url
      scene.imageUrl = uploaded.url
      scene.local_path = uploaded.path
      scene.localPath = uploaded.path
      scene.status = 'completed'
      toast.success('场景图片已替换')
      await options.refresh()
    } catch (error: unknown) {
      toast.error(errorMessageFromUnknown(error, '场景图片替换失败'))
    } finally {
      replacingSceneImageIds.value = replacingSceneImageIds.value.filter(item => item !== id)
    }
  }

  function batchSceneImages() {
    const ids = options.scenes.value
      .filter(s => !(s.image_url || s.imageUrl))
      .map(s => Number(s.id))
      .filter(Number.isFinite)
    if (!ids.length) {
      toast.info('所有场景图片已生成')
      return
    }
    pendingSceneImageIds.value = [...new Set([...pendingSceneImageIds.value, ...ids])]
    ids.forEach(id => {
      sceneAPI.generateImage(id, options.epId.value)
        .then(() => options.refresh())
        .catch((error: unknown) => toast.error(errorMessageFromUnknown(error)))
    })
    toast.success('场景图片批量生成中')
    options.watchAsyncResult(() => ids.every(id => {
      const scene = options.scenes.value.find(s => s.id === id)
      const done = !!(scene?.image_url || scene?.imageUrl)
      if (done) pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
      return done
    }), 36)
  }

  async function uploadSceneReference(payload: SceneReferenceImagePayload) {
    const scene = payload?.scene
    const file = payload?.file
    if (!scene?.id || !file) return
    if (!file.type?.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }

    const id = Number(scene.id)
    try {
      if (!isUploadingSceneReference(id)) uploadingSceneReferenceIds.value.push(id)
      const uploaded = await uploadAPI.image(file)
      await sceneAPI.update(id, { reference_image: uploaded.url })
      scene.reference_image = uploaded.url
      scene.referenceImage = uploaded.url
      toast.success('参考图已上传，再生成将以图生图模式运行')
      await options.refresh()
    } catch (error: unknown) {
      toast.error(errorMessageFromUnknown(error, '参考图上传失败'))
    } finally {
      uploadingSceneReferenceIds.value = uploadingSceneReferenceIds.value.filter(item => item !== id)
    }
  }

  async function clearSceneReference(scene: ChapterScene | null | undefined) {
    if (!scene?.id) return
    const id = Number(scene.id)
    try {
      await sceneAPI.update(id, { reference_image: null })
      scene.reference_image = null
      scene.referenceImage = null
      toast.success('参考图已移除，再生成将回到文生图模式')
      await options.refresh()
    } catch (error: unknown) {
      toast.error(errorMessageFromUnknown(error, '参考图移除失败'))
    }
  }

  return {
    pendingCharImageIds,
    pendingSceneImageIds,
    replacingCharacterImageIds,
    replacingSceneImageIds,
    uploadingSceneReferenceIds,
    isPendingCharImage,
    isPendingSceneImage,
    isReplacingCharacterImage,
    isReplacingSceneImage,
    isUploadingSceneReference,
    hasCharacterImage,
    hasSceneImage,
    hasSceneReferenceImage,
    getImageGenerateButtonLabel,
    getImageGenerateToastLabel,
    genCharImg,
    replaceCharImage,
    batchCharImages,
    genSceneImg,
    replaceSceneImage,
    batchSceneImages,
    uploadSceneReference,
    clearSceneReference,
  }
}
