import { ref, onUnmounted } from 'vue'
import { automationAPI, type AutomationStatusPayload } from '../useApi'
import { AUTOMATION_POLL_MS, isTerminalStatus, nextBackoffMs } from './automationPollingPolicy'

export function useAutomationStatus(episodeIdRef: () => number) {
  const status = ref<AutomationStatusPayload | null>(null)
  const loading = ref(false)
  let timer: number | null = null
  let errors = 0
  let stopped = false

  async function fetchOnce() {
    const id = episodeIdRef()
    if (!id) return
    loading.value = true
    try {
      const res = await automationAPI.get(id)
      if (res) status.value = res
      errors = 0
    } catch (err) {
      errors++
      console.warn('[automation] poll error', err)
    } finally {
      loading.value = false
    }
  }

  function scheduleNext() {
    if (stopped) return
    if (status.value && isTerminalStatus(status.value.status)) return
    const ms = errors > 0 ? nextBackoffMs(errors) : AUTOMATION_POLL_MS
    timer = window.setTimeout(async () => {
      await fetchOnce()
      scheduleNext()
    }, ms)
  }

  async function start() {
    stopped = false
    await fetchOnce()
    scheduleNext()
  }

  function stop() {
    stopped = true
    if (timer !== null) window.clearTimeout(timer)
    timer = null
  }

  onUnmounted(stop)

  return { status, loading, start, stop, refresh: fetchOnce }
}
