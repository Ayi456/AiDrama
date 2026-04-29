import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import {
  characterAPI, sceneAPI, imageAPI, videoAPI, composeAPI, mergeAPI, uploadAPI,
} from '~/composables/useApi'
import { useImageGenerationMonitor } from '~/composables/useImageGenerationMonitor'

interface UseEpisodeMediaPipelineOptions {
  dramaId: number
  epId: ComputedRef<number>
  chars: Ref<any[]>
  scenes: Ref<any[]>
  sbs: Ref<any[]>
  visualChars: ComputedRef<any[]>
  selectedSb: Ref<any>
  mergeData?: Ref<any>
  refresh: () => Promise<void>
  lockedImageConfigId: ComputedRef<number | null>
  lockedVideoConfigId: ComputedRef<number | null>
  shotImageResolvedSize: ComputedRef<string>
  shotImageAspectRatio: Ref<string>
  updateField: (sb: any, field: string, value: any) => void
  getStoryboardCharacterIds: (sb: any) => number[]
  getStoryboardCharacterNames: (sb: any) => string[]
  getSceneName: (sb: any) => string
}

export function useEpisodeMediaPipeline(options: UseEpisodeMediaPipelineOptions) {
  const pendingCharImageIds = ref<number[]>([])
  const pendingSceneImageIds = ref<number[]>([])
  const replacingCharacterImageIds = ref<number[]>([])
  const replacingSceneImageIds = ref<number[]>([])
  const pendingShotFrameKeys = ref<string[]>([])
  const pendingVideoIds = ref<number[]>([])
  const pendingComposeIds = ref<number[]>([])
  const failedVideoMessages = ref<Record<number, string>>({})
  const failedComposeMessages = ref<Record<number, string>>({})
  const shotImageHistory = ref<Record<number, Array<{ frameType: string; src: string; createdAt: number }>>>({})
  const { sleep, watchAsyncResult, waitForImageGeneration, waitForImageAssetUpdate } = useImageGenerationMonitor(options.refresh)

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

  function hasCharacterImage(char: any) {
    return !!(char?.image_url || char?.imageUrl)
  }

  function hasSceneImage(scene: any) {
    return !!(scene?.image_url || scene?.imageUrl)
  }

  function getImageGenerateButtonLabel(hasImage: boolean, pending: boolean) {
    if (pending) return '生成中'
    return hasImage ? '重新生成' : '生成'
  }

  function getImageGenerateToastLabel(hasImage: boolean, assetLabel: string) {
    return `${assetLabel}${hasImage ? '重新生成' : '生成'}中`
  }

  function framePendingKey(id: number, frameType: string) {
    return `${id}:${frameType}`
  }

  function isPendingShotFrame(id: number, frameType: string) {
    return pendingShotFrameKeys.value.includes(framePendingKey(id, frameType))
  }

  function isPendingVideo(id: number) {
    return pendingVideoIds.value.includes(id)
  }

  function videoFailMessage(id: number) {
    return failedVideoMessages.value[id] || ''
  }

  function isPendingCompose(id: number) {
    return pendingComposeIds.value.includes(id)
  }

  function composeFailMessage(id: number) {
    return failedComposeMessages.value[id] || ''
  }

  function getFirstFrame(storyboard: any) {
    return storyboard?.first_frame_image || storyboard?.firstFrameImage || null
  }

  function getLastFrame(storyboard: any) {
    return storyboard?.last_frame_image || storyboard?.lastFrameImage || null
  }

  function getStoryboardCover(storyboard: any) {
    return storyboard?.composed_image || storyboard?.composedImage || getFirstFrame(storyboard) || getLastFrame(storyboard) || null
  }

  function getVideoUrl(storyboard: any) {
    return storyboard?.video_url || storyboard?.videoUrl || null
  }

  function getComposedVideoUrl(storyboard: any) {
    return storyboard?.composed_video_url || storyboard?.composedVideoUrl || null
  }

  function hasImg(storyboard: any) {
    return !!getStoryboardCover(storyboard)
  }

  function hasVid(storyboard: any) {
    return !!getVideoUrl(storyboard)
  }

  function hasComposed(storyboard: any) {
    return !!getComposedVideoUrl(storyboard)
  }

  function getRefs(storyboard: any) {
    const raw = storyboard.reference_images || storyboard.referenceImages
    if (!raw) return []
    try {
      return JSON.parse(raw)
    } catch {
      return []
    }
  }

  function getShotReferenceImages(storyboard: any) {
    const refs: string[] = []
    const pushRef = (value: string | null | undefined) => {
      if (!value || refs.includes(value) || refs.length >= 6) return
      refs.push(value)
    }

    const sceneId = storyboard?.scene_id || storyboard?.sceneId
    const scene = options.scenes.value.find(item => item.id === sceneId)
    pushRef(scene?.image_url || scene?.imageUrl)

    for (const charId of options.getStoryboardCharacterIds(storyboard)) {
      const char = options.chars.value.find(item => item.id === charId)
      pushRef(char?.image_url || char?.imageUrl)
    }

    for (const ref of getRefs(storyboard)) pushRef(ref)
    return refs.filter(Boolean).slice(0, 6)
  }

  function getShotManualReferenceImages(storyboard: any) {
    return getRefs(storyboard).filter(Boolean).slice(0, 6)
  }

  function pushShotImageHistory(storyboardId: number, frameType: string, src: string | null | undefined) {
    if (!storyboardId || !frameType || !src) return
    const current = shotImageHistory.value[storyboardId] || []
    if (current.some(item => item.frameType === frameType && item.src === src)) return
    shotImageHistory.value = {
      ...shotImageHistory.value,
      [storyboardId]: [{ frameType, src, createdAt: Date.now() }, ...current].slice(0, 12),
    }
  }

  function removeShotImageHistory(storyboardId: number, frameType: string, src: string) {
    const current = shotImageHistory.value[storyboardId] || []
    shotImageHistory.value = {
      ...shotImageHistory.value,
      [storyboardId]: current.filter(item => !(item.frameType === frameType && item.src === src)),
    }
  }

  function buildShotImagePrompt(storyboard: any, frameType: string, aspectRatio = options.shotImageAspectRatio.value) {
    const title = storyboard.title || ''
    const description = storyboard.image_prompt || storyboard.imagePrompt || storyboard.description || ''
    const shotType = storyboard.shot_type || storyboard.shotType || ''
    const angle = storyboard.angle || ''
    const movement = storyboard.movement || ''
    const location = storyboard.location || options.getSceneName(storyboard)
    const time = storyboard.time || ''
    const charactersText = options.getStoryboardCharacterNames(storyboard).join('、')
    const action = storyboard.action || ''
    const atmosphere = storyboard.atmosphere || ''
    const frameHint = frameType === 'first_frame'
      ? '生成这个镜头的起始关键帧，突出建立关系和动作开始瞬间。'
      : '生成这个镜头的结束关键帧，突出动作结束、情绪落点或结果状态。'

    return [
      title ? `镜头标题：${title}` : '',
      description ? `画面描述：${description}` : '',
      shotType ? `景别：${shotType}` : '',
      angle ? `机位：${angle}` : '',
      movement ? `运镜：${movement}` : '',
      charactersText ? `角色：${charactersText}` : '',
      location ? `地点：${location}` : '',
      time ? `时间：${time}` : '',
      action ? `动作：${action}` : '',
      atmosphere ? `氛围：${atmosphere}` : '',
      aspectRatio ? `画幅比例：${aspectRatio}` : '',
      frameHint,
    ].filter(Boolean).join('；')
  }

  function buildDefaultVideoPrompt(storyboard: any) {
    if (!storyboard) return ''
    return [
      storyboard.title ? `镜头标题：${storyboard.title}` : '',
      storyboard.description ? `画面描述：${storyboard.description}` : '',
      storyboard.shot_type || storyboard.shotType ? `景别：${storyboard.shot_type || storyboard.shotType}` : '',
      storyboard.movement ? `运镜：${storyboard.movement}` : '',
      storyboard.action ? `动作：${storyboard.action}` : '',
      storyboard.atmosphere ? `氛围：${storyboard.atmosphere}` : '',
      '请生成节奏自然、动作连贯、电影感强的镜头视频。',
    ].filter(Boolean).join('\n')
  }

  function getStoryboardStateText(storyboard: any) {
    if (!storyboard) return '待制作'
    if (hasComposed(storyboard)) return '已合成'
    if (isPendingCompose(storyboard.id)) return '合成中'
    if (hasVid(storyboard)) return '已生成视频'
    if (isPendingVideo(storyboard.id)) return '视频生成中'
    if (getFirstFrame(storyboard) || getLastFrame(storyboard)) return '已出帧'
    return '待制作'
  }

  function getStoryboardStateClass(storyboard: any) {
    const text = getStoryboardStateText(storyboard)
    if (text === '已合成' || text === '已生成视频') return 'is-ready'
    if (text === '合成中' || text === '视频生成中') return 'is-pending'
    if (text === '已出帧') return 'is-warm'
    return 'is-empty'
  }

  function getVideoGenerateActionLabel(storyboard: any) {
    if (isPendingVideo(storyboard.id)) return '生成中'
    return '生成视频'
  }

  function getVideoStateText(storyboard: any) {
    if (isPendingVideo(storyboard.id)) return '生成中'
    if (hasVid(storyboard)) return '已生成'
    if (hasImg(storyboard)) return '待生成'
    return '仅文本'
  }

  function getVideoStateClass(storyboard: any) {
    const text = getVideoStateText(storyboard)
    if (text === '已生成') return 'is-ready'
    if (text === '生成中') return 'is-pending'
    if (text === '待生成') return 'is-warm'
    return 'is-empty'
  }

  function getVideoReferenceSummary(storyboard: any) {
    const first = getFirstFrame(storyboard)
    const last = getLastFrame(storyboard)
    const refs = getRefs(storyboard)
    if (first && last) return '首尾帧参考'
    if (first) return '首帧参考'
    if (refs.length) return `${refs.length} 张参考图`
    return '仅提示词生成'
  }

  function getComposeStateText(storyboard: any) {
    if (isPendingCompose(storyboard.id)) return '合成中'
    if (hasComposed(storyboard)) return '已合成'
    if (hasVid(storyboard)) return '待合成'
    return '无源视频'
  }

  function getComposeStateClass(storyboard: any) {
    const text = getComposeStateText(storyboard)
    if (text === '已合成') return 'is-ready'
    if (text === '合成中') return 'is-pending'
    if (text === '待合成') return 'is-warm'
    return 'is-empty'
  }

  function getComposeActionLabel(storyboard: any) {
    if (isPendingCompose(storyboard.id)) return '合成中'
    return hasComposed(storyboard) ? '重新合成' : '开始合成'
  }

  function getComposeSourceSummary(storyboard: any) {
    if (hasComposed(storyboard)) return '已输出标准化合成视频'
    if (hasVid(storyboard)) return '将基于当前镜头视频进行标准化输出'
    return '需要先生成镜头视频'
  }

  const activeVideoSb = computed(() => options.selectedSb.value || options.sbs.value[0] || null)
  const activeVideoShotIndex = computed(() => activeVideoSb.value ? options.sbs.value.findIndex(sb => sb.id === activeVideoSb.value.id) : -1)
  const activeVideoShotIndexLabel = computed(() => String(activeVideoShotIndex.value + 1).padStart(2, '0'))

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
        await waitForImageGeneration(generationId)
        await waitForImageAssetUpdate(() => {
          const current = options.chars.value.find(item => item.id === id)
          return current?.image_url || current?.imageUrl || ''
        }, previousImage, 12, 1000)
      } else {
        await waitForImageAssetUpdate(() => {
          const current = options.chars.value.find(item => item.id === id)
          return current?.image_url || current?.imageUrl || ''
        }, previousImage)
      }
      pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
    } catch (error: any) {
      pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
      toast.error(error.message)
    }
  }

  async function replaceCharImage(payload: { character?: any; file?: File }) {
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
    } catch (error: any) {
      toast.error(error.message || '角色图片替换失败')
    } finally {
      replacingCharacterImageIds.value = replacingCharacterImageIds.value.filter(item => item !== id)
    }
  }

  function batchCharImages() {
    const ids = options.visualChars.value.filter(c => !(c.image_url || c.imageUrl)).map(c => c.id)
    if (!ids.length) {
      toast.info('所有角色图片已生成')
      return
    }
    pendingCharImageIds.value = [...new Set([...pendingCharImageIds.value, ...ids])]
    characterAPI.batchImages(ids, options.epId.value).then(async () => {
      toast.success('角色图片批量生成中')
      await options.refresh()
      watchAsyncResult(() => ids.every(id => {
        const char = options.chars.value.find(c => c.id === id)
        const done = !!(char?.image_url || char?.imageUrl)
        if (done) pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
        return done
      }), 36)
    }).catch((error: any) => {
      pendingCharImageIds.value = pendingCharImageIds.value.filter(item => !ids.includes(item))
      toast.error(error.message)
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
        await waitForImageGeneration(generationId)
        await waitForImageAssetUpdate(() => {
          const current = options.scenes.value.find(item => item.id === id)
          return current?.image_url || current?.imageUrl || ''
        }, previousImage, 12, 1000)
      } else {
        await waitForImageAssetUpdate(() => {
          const current = options.scenes.value.find(item => item.id === id)
          return current?.image_url || current?.imageUrl || ''
        }, previousImage)
      }
      pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
    } catch (error: any) {
      pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
      toast.error(error.message)
    }
  }

  async function replaceSceneImage(payload: { scene?: any; file?: File }) {
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
    } catch (error: any) {
      toast.error(error.message || '场景图片替换失败')
    } finally {
      replacingSceneImageIds.value = replacingSceneImageIds.value.filter(item => item !== id)
    }
  }

  function batchSceneImages() {
    const ids = options.scenes.value.filter(s => !(s.image_url || s.imageUrl)).map(s => s.id)
    if (!ids.length) {
      toast.info('所有场景图片已生成')
      return
    }
    pendingSceneImageIds.value = [...new Set([...pendingSceneImageIds.value, ...ids])]
    ids.forEach(id => {
      sceneAPI.generateImage(id, options.epId.value).then(() => options.refresh()).catch((error: any) => toast.error(error.message))
    })
    toast.success('场景图片批量生成中')
    watchAsyncResult(() => ids.every(id => {
      const scene = options.scenes.value.find(s => s.id === id)
      const done = !!(scene?.image_url || scene?.imageUrl)
      if (done) pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
      return done
    }), 36)
  }

  async function genShotFrame(storyboard: any, frameType: string) {
    const prompt = buildShotImagePrompt(storyboard, frameType, options.shotImageAspectRatio.value)
    const referenceImages = getShotReferenceImages(storyboard)
    const key = framePendingKey(storyboard.id, frameType)
    const previousImage = frameType === 'first_frame' ? getFirstFrame(storyboard) : getLastFrame(storyboard)
    const isReroll = !!previousImage
    if (previousImage) pushShotImageHistory(storyboard.id, frameType, previousImage)
    try {
      if (!pendingShotFrameKeys.value.includes(key)) pendingShotFrameKeys.value.push(key)
      const generation = await imageAPI.generate({
        storyboard_id: storyboard.id,
        drama_id: options.dramaId,
        config_id: options.lockedImageConfigId.value || undefined,
        prompt,
        size: options.shotImageResolvedSize.value,
        frame_type: frameType,
        reference_images: referenceImages.length ? referenceImages : undefined,
      })
      toast.success(getImageGenerateToastLabel(isReroll, frameType === 'first_frame' ? '首帧' : '尾帧'))
      const generationId = Number(generation?.id || 0)
      if (generationId) {
        await waitForImageGeneration(generationId)
        await waitForImageAssetUpdate(() => {
          const target = options.sbs.value.find(s => s.id === storyboard.id)
          return frameType === 'first_frame' ? getFirstFrame(target) : getLastFrame(target)
        }, previousImage, 12, 1000)
      } else {
        await waitForImageAssetUpdate(() => {
          const target = options.sbs.value.find(s => s.id === storyboard.id)
          return frameType === 'first_frame' ? getFirstFrame(target) : getLastFrame(target)
        }, previousImage)
      }
      pendingShotFrameKeys.value = pendingShotFrameKeys.value.filter(item => item !== key)
    } catch (error: any) {
      pendingShotFrameKeys.value = pendingShotFrameKeys.value.filter(item => item !== key)
      toast.error(error.message)
    }
  }

  async function genVid(storyboard: any) {
    const params: Record<string, any> = {
      storyboard_id: storyboard.id,
      drama_id: options.dramaId,
      config_id: options.lockedVideoConfigId.value || undefined,
      prompt: storyboard.video_prompt || storyboard.videoPrompt || '',
      duration: Number(storyboard.duration || 5),
    }
    const first = getFirstFrame(storyboard)
    const last = getLastFrame(storyboard)
    const refs = getRefs(storyboard)
    if (first && last) Object.assign(params, { reference_mode: 'first_last', first_frame_url: first, last_frame_url: last })
    else if (refs.length) Object.assign(params, { reference_mode: 'multiple', reference_image_urls: [first, ...refs].filter(Boolean) })
    else if (first) Object.assign(params, { reference_mode: 'single', image_url: first })

    try {
      delete failedVideoMessages.value[storyboard.id]
      if (!isPendingVideo(storyboard.id)) pendingVideoIds.value.push(storyboard.id)
      const generation = await videoAPI.generate(params)
      toast.success('视频生成中')
      await options.refresh()
      void pollVideoGeneration(generation?.id, storyboard.id)
    } catch (error: any) {
      pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboard.id)
      toast.error(error.message)
    }
  }

  async function pollVideoGeneration(generationId: number, storyboardId: number) {
    if (!generationId) {
      watchAsyncResult(() => {
        const target = options.sbs.value.find(s => s.id === storyboardId)
        const done = !!(target?.video_url || target?.videoUrl)
        if (done) pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
        return done
      }, 60, 4000)
      return
    }

    for (let i = 0; i < 120; i++) {
      await sleep(4000)
      try {
        const res = await videoAPI.get(generationId)
        await options.refresh()
        if (res?.status === 'completed') {
          pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
          delete failedVideoMessages.value[storyboardId]
          toast.success('视频生成完成')
          return
        }
        if (res?.status === 'failed') {
          pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
          failedVideoMessages.value = {
            ...failedVideoMessages.value,
            [storyboardId]: res?.error_msg || res?.errorMsg || '视频生成失败',
          }
          toast.error(failedVideoMessages.value[storyboardId])
          return
        }
      } catch {}
    }

    pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
    failedVideoMessages.value = {
      ...failedVideoMessages.value,
      [storyboardId]: '视频生成超时',
    }
    toast.error('视频生成超时')
  }

  async function doCompose(storyboard: any) {
    try {
      delete failedComposeMessages.value[storyboard.id]
      if (!isPendingCompose(storyboard.id)) pendingComposeIds.value.push(storyboard.id)
      await composeAPI.shot(storyboard.id)
      toast.success('合成完成')
      pendingComposeIds.value = pendingComposeIds.value.filter(item => item !== storyboard.id)
      void options.refresh()
    } catch (error: any) {
      pendingComposeIds.value = pendingComposeIds.value.filter(item => item !== storyboard.id)
      failedComposeMessages.value = {
        ...failedComposeMessages.value,
        [storyboard.id]: error.message,
      }
      toast.error(error.message)
    }
  }

  function batchVideos() {
    const pendingIds = options.sbs.value.filter(s => !hasVid(s)).map(s => s.id)
    pendingIds.forEach(id => {
      const storyboard = options.sbs.value.find(item => item.id === id)
      if (storyboard) void genVid(storyboard)
    })
    if (!pendingIds.length) return
    pendingVideoIds.value = [...new Set([...pendingVideoIds.value, ...pendingIds])]
    watchAsyncResult(() => pendingIds.every(id => {
      const target = options.sbs.value.find(s => s.id === id)
      const done = !!(target?.video_url || target?.videoUrl)
      if (done) pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== id)
      return done
    }), 80, 4000)
  }

  async function batchCompose() {
    await composeAPI.all(options.epId.value)
    pendingComposeIds.value = [...new Set(options.sbs.value.filter(sb => !!sb.video_url || !!sb.videoUrl).map(sb => sb.id))]
    toast.success('批量合成已开始')
    void pollComposeStatus()
  }

  async function doMerge() {
    const composedCount = options.sbs.value.filter(sb => sb.composed_video_url || sb.composedVideoUrl).length
    if (composedCount === 0) {
      toast.error('请先至少合成 1 个镜头')
      return
    }

    try {
      await mergeAPI.merge(options.epId.value)
      toast.success('正在拼接视频…')
      const poll = setInterval(async () => {
        try {
          const mergeData = await mergeAPI.status(options.epId.value)
          if (options.mergeData) options.mergeData.value = mergeData
          if (mergeData?.status === 'completed' || mergeData?.status === 'failed') {
            clearInterval(poll)
            mergeData.status === 'completed' ? toast.success('视频拼接完成') : toast.error(mergeData?.error_msg || mergeData?.errorMsg || '拼接失败')
          }
        } catch (error: any) {
          toast.error(error.message || '查询拼接状态失败')
        }
      }, 3000)
    } catch (error: any) {
      toast.error(error.message || '拼接启动失败')
    }
  }

  async function pollComposeStatus() {
    for (let i = 0; i < 120; i++) {
      await sleep(3000)
      try {
        const res = await composeAPI.status(options.epId.value)
        await options.refresh()
        const items = Array.isArray(res?.items) ? res.items : []
        const processingIds = items.filter(item => item.status === 'compose_processing').map(item => item.id)
        pendingComposeIds.value = processingIds

        const failedItems = items.filter(item => item.status === 'compose_failed')
        if (failedItems.length) {
          const next = { ...failedComposeMessages.value }
          failedItems.forEach((item) => {
            next[item.id] = item.error_msg || item.errorMsg || '视频合成失败'
          })
          failedComposeMessages.value = next
        }

        if (!processingIds.length) {
          if (failedItems.length) toast.error(`有 ${failedItems.length} 个镜头合成失败`)
          else toast.success('批量合成完成')
          return
        }
      } catch {}
    }
  }

  function handleShotFrameGenerate(payload: any) {
    if (!payload?.sb || !payload?.frameType) return
    const quantity = Math.max(1, Math.min(4, Number(payload.quantity) || 1))
    for (let i = 0; i < quantity; i++) void genShotFrame(payload.sb, payload.frameType)
  }

  function handleShotFrameRestore(payload: any) {
    if (!payload?.sb || !payload?.frameType || !payload?.src) return
    const field = payload.frameType === 'last_frame' ? 'last_frame_image' : 'first_frame_image'
    const current = payload.frameType === 'last_frame' ? getLastFrame(payload.sb) : getFirstFrame(payload.sb)
    pushShotImageHistory(payload.sb.id, payload.frameType, current)
    options.updateField(payload.sb, field, payload.src)
    removeShotImageHistory(payload.sb.id, payload.frameType, payload.src)
    toast.success('已替换为历史图片')
  }

  return {
    pendingCharImageIds,
    pendingSceneImageIds,
    replacingCharacterImageIds,
    replacingSceneImageIds,
    pendingShotFrameKeys,
    pendingVideoIds,
    pendingComposeIds,
    failedVideoMessages,
    failedComposeMessages,
    shotImageHistory,
    isPendingCharImage,
    isPendingSceneImage,
    isReplacingCharacterImage,
    isReplacingSceneImage,
    hasCharacterImage,
    hasSceneImage,
    getImageGenerateButtonLabel,
    getImageGenerateToastLabel,
    framePendingKey,
    isPendingShotFrame,
    isPendingVideo,
    videoFailMessage,
    isPendingCompose,
    composeFailMessage,
    getStoryboardStateText,
    getStoryboardStateClass,
    getVideoGenerateActionLabel,
    getVideoStateText,
    getVideoStateClass,
    getVideoReferenceSummary,
    buildDefaultVideoPrompt,
    getComposeStateText,
    getComposeStateClass,
    getComposeActionLabel,
    getComposeSourceSummary,
    activeVideoSb,
    activeVideoShotIndex,
    activeVideoShotIndexLabel,
    getFirstFrame,
    getLastFrame,
    getStoryboardCover,
    getVideoUrl,
    getComposedVideoUrl,
    hasImg,
    hasVid,
    hasComposed,
    getShotReferenceImages,
    getShotManualReferenceImages,
    getRefs,
    pushShotImageHistory,
    removeShotImageHistory,
    buildShotImagePrompt,
    genCharImg,
    replaceCharImage,
    batchCharImages,
    genSceneImg,
    replaceSceneImage,
    batchSceneImages,
    genShotFrame,
    genVid,
    pollVideoGeneration,
    doCompose,
    batchVideos,
    batchCompose,
    doMerge,
    pollComposeStatus,
    handleShotFrameGenerate,
    handleShotFrameRestore,
  }
}
