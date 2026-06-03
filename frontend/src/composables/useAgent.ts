import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { api, type ApiEntity } from './useApi'

type BreakdownProgress = { current: number; total: number }

export function useAgent() {
  const running = ref(false)
  const runningType = ref<string | null>(null)
  const progress = ref<BreakdownProgress | null>(null)

  // 分镜拆解逐 chunk 驱动：先取 chunk 总数，再逐个请求。每次请求都远低于 SCF 900s
  // 单请求执行上限，避免长脚本一次性拆解超时（headers/网关超时）。
  async function runStoryboardBreakdown(msg: string, dramaId: number, episodeId: number) {
    const plan = await api.post<{ total?: number }>('/agent/storyboard_breaker/plan', {
      drama_id: dramaId,
      episode_id: episodeId,
    })
    const total = Number(plan?.total || 0)
    if (!total) throw new Error('剧本无法拆分为分镜')

    progress.value = { current: 0, total }
    for (let i = 1; i <= total; i++) {
      await api.post<ApiEntity>('/agent/storyboard_breaker/chunk', {
        message: msg,
        drama_id: dramaId,
        episode_id: episodeId,
        chunk_index: i,
      })
      progress.value = { current: i, total }
    }
  }

  async function run(type: string, msg: string, dramaId: number, episodeId: number, onDone?: () => void) {
    if (running.value) { toast.warning('操作执行中'); return }
    running.value = true
    runningType.value = type
    progress.value = null
    try {
      if (type === 'storyboard_breaker') {
        await runStoryboardBreakdown(msg, dramaId, episodeId)
      } else {
        await api.post<ApiEntity>(`/agent/${type}/chat`, {
          message: msg,
          drama_id: dramaId,
          episode_id: episodeId,
        })
      }
      toast.success('完成')
      onDone?.()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    } finally {
      running.value = false
      runningType.value = null
      progress.value = null
    }
  }

  return { running, runningType, progress, run }
}
