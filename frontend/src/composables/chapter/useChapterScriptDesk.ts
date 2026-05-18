import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import {
  chapterAPI,
  type AiConfig,
  type Episode,
} from '../useApi.ts'

type ChapterScriptEpisode = Episode & {
  content?: string
  script_content?: string
  scriptContent?: string
}

type ChapterUpdatePayload = {
  content?: string
  script_content?: string
}

type RunAgent = (
  type: string,
  prompt: string,
  dramaId: number,
  episodeId: number,
  refresh?: () => void | Promise<void>,
) => void

type ChapterScriptDeskOptions = {
  dramaId: number
  epId: ComputedRef<number>
  episode: Ref<ChapterScriptEpisode | null>
  scriptStep: Ref<number>
  videoConfigs: Ref<AiConfig[]>
  lockedVideoConfigId: ComputedRef<number | null>
  runAgent: RunAgent
  refresh: () => void | Promise<void>
  updateChapter?: (id: number, payload: ChapterUpdatePayload) => void | Promise<void>
  notifySuccess?: (message: string) => void
  notifyWarning?: (message: string) => void
}

function defaultUpdateChapter(id: number, payload: ChapterUpdatePayload) {
  return chapterAPI.update(id, payload)
}

export function useChapterScriptDesk(options: ChapterScriptDeskOptions) {
  const localRaw = ref('')
  const localScript = ref('')
  const rawContent = computed(() => options.episode.value?.content || '')
  const scriptContent = computed(() => options.episode.value?.script_content || options.episode.value?.scriptContent || '')
  const rawLen = computed(() => localRaw.value.replace(/\s/g, '').length || 0)
  const scriptLen = computed(() => localScript.value.replace(/\s/g, '').length || 0)
  const updateChapter = options.updateChapter || defaultUpdateChapter

  watch(rawContent, value => { localRaw.value = value }, { immediate: true })
  watch(scriptContent, value => { localScript.value = value }, { immediate: true })

  async function saveRaw() {
    const id = options.epId.value
    if (!id || !options.episode.value) return
    options.episode.value.content = localRaw.value
    await updateChapter(id, { content: localRaw.value })
  }

  async function saveScr() {
    const id = options.epId.value
    if (!id || !options.episode.value) return
    options.episode.value.script_content = localScript.value
    await updateChapter(id, { script_content: localScript.value })
  }

  function doRewrite() {
    void saveRaw()
    options.runAgent(
      'script_rewriter',
      '请读取剧本并改写为格式化剧本，然后保存。',
      options.dramaId,
      options.epId.value,
      options.refresh,
    )
  }

  function skipRewrite() {
    const raw = (localRaw.value || rawContent.value || '').trim()
    if (!raw) {
      options.notifyWarning?.('请先填写原始内容')
      return
    }
    localScript.value = raw
    void saveScr()
    options.notifySuccess?.('已跳过 AI 改写，当前将直接使用原始内容')
    options.scriptStep.value = 2
  }

  function doExtract() {
    void saveScr()
    options.runAgent(
      'extractor',
      '请从剧本中提取所有角色和场景信息，提取时自动与项目已有数据进行去重合并。',
      options.dramaId,
      options.epId.value,
      options.refresh,
    )
  }

  function doBreakdown() {
    const config = options.videoConfigs.value.find(item => item.id === options.lockedVideoConfigId.value)
    const label = config ? `${config.name} (${config.provider})` : '默认'
    options.runAgent(
      'storyboard_breaker',
      `请拆解分镜并生成视频提示词。视频模型：${label}，请根据该模型的特性和时长限制生成合适的视频提示词。`,
      options.dramaId,
      options.epId.value,
      options.refresh,
    )
  }

  return {
    localRaw,
    localScript,
    rawContent,
    scriptContent,
    rawLen,
    scriptLen,
    saveRaw,
    saveScr,
    doRewrite,
    skipRewrite,
    doExtract,
    doBreakdown,
  }
}
