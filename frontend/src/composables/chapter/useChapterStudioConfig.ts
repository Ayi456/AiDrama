import { computed, ref, watch, type Ref } from 'vue'
import {
  aiConfigAPI,
  chapterAPI,
  type AiConfig,
  type Drama,
  type Episode,
} from '@/composables/useApi'

type StudioConfigDrama = Drama & {
  image_config_id?: number
  imageConfigId?: number
  video_config_id?: number
  videoConfigId?: number
}

type StudioConfigEpisode = Episode & {
  image_config_id?: number
  imageConfigId?: number
  video_config_id?: number
  videoConfigId?: number
}

type ChapterStudioConfigOptions = {
  drama: Ref<StudioConfigDrama | null>
  episode: Ref<StudioConfigEpisode | null>
}

function configModelName(config: AiConfig | null | undefined) {
  if (!config) return ''
  const rawModel = config.model
  if (Array.isArray(rawModel)) return String(rawModel[0] || config.name || '')
  try {
    const model = JSON.parse(String(rawModel || '[]'))
    return Array.isArray(model) ? String(model[0] || config.name || '') : String(model || config.name || '')
  } catch {
    return String(rawModel || config.name || '')
  }
}

function configLabel(config: AiConfig | null | undefined) {
  if (!config) return '未配置'
  const modelName = configModelName(config)
  return modelName ? `${config.name} · ${modelName} (${config.provider})` : `${config.name} (${config.provider})`
}

export function useChapterStudioConfig(options: ChapterStudioConfigOptions) {
  const imageConfigs = ref<AiConfig[]>([])
  const videoConfigs = ref<AiConfig[]>([])
  const syncingEpisodeConfigIds = ref(false)
  const syncedEpisodeConfigKeys = ref(new Set<string>())

  const dramaImageConfigId = computed(() => options.drama.value?.image_config_id || options.drama.value?.imageConfigId || null)
  const dramaVideoConfigId = computed(() => options.drama.value?.video_config_id || options.drama.value?.videoConfigId || null)
  const episodeImageConfigId = computed(() => options.episode.value?.image_config_id || options.episode.value?.imageConfigId || null)
  const episodeVideoConfigId = computed(() => options.episode.value?.video_config_id || options.episode.value?.videoConfigId || null)
  const lockedImageConfigId = computed(() => episodeImageConfigId.value || dramaImageConfigId.value || imageConfigs.value[0]?.id || null)
  const lockedVideoConfigId = computed(() => episodeVideoConfigId.value || dramaVideoConfigId.value || videoConfigs.value[0]?.id || null)
  const lockedImageConfig = computed(() => imageConfigs.value.find(config => config.id === lockedImageConfigId.value))
  const lockedVideoConfig = computed(() => videoConfigs.value.find(config => config.id === lockedVideoConfigId.value))
  const lockedImageProvider = computed(() => lockedImageConfig.value?.provider || '')
  const lockedVideoProvider = computed(() => lockedVideoConfig.value?.provider || '')
  const lockedImageConfigLabel = computed(() => configLabel(lockedImageConfig.value))
  const lockedImageModelName = computed(() => configModelName(lockedImageConfig.value))
  const lockedVideoConfigLabel = computed(() => configLabel(lockedVideoConfig.value))
  const lockedVideoModelName = computed(() => configModelName(lockedVideoConfig.value))

  watch(
    [() => options.episode.value?.id, episodeImageConfigId, episodeVideoConfigId, lockedImageConfigId, lockedVideoConfigId],
    async ([episodeId, imageConfigId, videoConfigId, fallbackImageConfigId, fallbackVideoConfigId]) => {
      if (!episodeId || syncingEpisodeConfigIds.value) return

      const nextImageConfigId = imageConfigId || fallbackImageConfigId || null
      const nextVideoConfigId = videoConfigId || fallbackVideoConfigId || null
      const shouldSyncImage = !imageConfigId && !!nextImageConfigId
      const shouldSyncVideo = !videoConfigId && !!nextVideoConfigId
      if (!shouldSyncImage && !shouldSyncVideo) return

      const syncKey = `${episodeId}:${nextImageConfigId || 0}:${nextVideoConfigId || 0}`
      if (syncedEpisodeConfigKeys.value.has(syncKey)) return

      syncingEpisodeConfigIds.value = true
      try {
        const payload: Record<string, number> = {}
        if (shouldSyncImage && nextImageConfigId) payload.image_config_id = nextImageConfigId
        if (shouldSyncVideo && nextVideoConfigId) payload.video_config_id = nextVideoConfigId
        await chapterAPI.update(Number(episodeId), payload)
        options.episode.value = {
          ...(options.episode.value || {}),
          ...(shouldSyncImage ? { image_config_id: nextImageConfigId || undefined } : {}),
          ...(shouldSyncVideo ? { video_config_id: nextVideoConfigId || undefined } : {}),
        }
        syncedEpisodeConfigKeys.value.add(syncKey)
      } catch (error: unknown) {
        console.error('Failed to sync episode config ids', error)
      } finally {
        syncingEpisodeConfigIds.value = false
      }
    },
    { immediate: true },
  )

  async function loadConfigs() {
    try {
      const [imageRows, videoRows] = await Promise.all([
        aiConfigAPI.list('image'),
        aiConfigAPI.list('video'),
      ])
      imageConfigs.value = imageRows || []
      videoConfigs.value = videoRows || []
    } catch (error: unknown) {
      console.error('Failed to load AI configs', error)
    }
  }

  return {
    imageConfigs,
    videoConfigs,
    lockedImageConfigId,
    lockedVideoConfigId,
    lockedImageProvider,
    lockedVideoProvider,
    lockedImageConfigLabel,
    lockedImageModelName,
    lockedVideoConfigLabel,
    lockedVideoModelName,
    loadConfigs,
  }
}
