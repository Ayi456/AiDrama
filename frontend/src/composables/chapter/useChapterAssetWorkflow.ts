import { ref, type ComputedRef, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import { characterAPI, sceneAPI, uploadAPI } from '@/composables/useApi'
import type {
  ChapterCharacter,
  ChapterScene,
  ReplaceCharacterImagePayload,
  ReplaceSceneImagePayload,
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

export function useChapterAssetWorkflow(options: ChapterAssetWorkflowOptions) {
  const pendingCharImageIds = ref<number[]>([])
  const pendingSceneImageIds = ref<number[]>([])
  const replacingCharacterImageIds = ref<number[]>([])
  const replacingSceneImageIds = ref<number[]>([])

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

  function hasCharacterImage(char: ChapterCharacter | null | undefined) {
    return !!(char?.image_url || char?.imageUrl)
  }

  function hasSceneImage(scene: ChapterScene | null | undefined) {
    return !!(scene?.image_url || scene?.imageUrl)
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
      character.image_url = uploaded.url
      character.imageUrl = uploaded.url
      character.local_path = uploaded.path
      character.localPath = uploaded.path
      toast.success('角色图片已替换')
      await options.refresh()
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

  return {
    pendingCharImageIds,
    pendingSceneImageIds,
    replacingCharacterImageIds,
    replacingSceneImageIds,
    isPendingCharImage,
    isPendingSceneImage,
    isReplacingCharacterImage,
    isReplacingSceneImage,
    hasCharacterImage,
    hasSceneImage,
    getImageGenerateButtonLabel,
    getImageGenerateToastLabel,
    genCharImg,
    replaceCharImage,
    batchCharImages,
    genSceneImg,
    replaceSceneImage,
    batchSceneImages,
  }
}
