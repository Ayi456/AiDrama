import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { api, type ApiEntity } from './useApi'

export function useAgent() {
  const running = ref(false)
  const runningType = ref<string | null>(null)

  async function run(type: string, msg: string, dramaId: number, episodeId: number, onDone?: () => void) {
    if (running.value) { toast.warning('操作执行中'); return }
    running.value = true
    runningType.value = type
    try {
      await api.post<ApiEntity>(`/agent/${type}/chat`, {
        message: msg,
        drama_id: dramaId,
        episode_id: episodeId,
      })
      toast.success('完成')
      onDone?.()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '鎿嶄綔澶辫触')
    } finally {
      running.value = false
      runningType.value = null
    }
  }

  return { running, runningType, run }
}
