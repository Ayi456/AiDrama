<template>
  <div v-if="status && status.status !== 'idle'" class="automation-progress-bar" :class="{ 'is-failed': status.status === 'failed' }">
    <div class="automation-progress-bar__label">
      {{ stageOrdinal }}/5 · {{ status.progress.label }}
      <span v-if="status.progress.total > 0" class="muted">
        ({{ status.progress.current }}/{{ status.progress.total }})
      </span>
    </div>
    <div class="automation-progress-bar__track">
      <div class="automation-progress-bar__fill" :style="{ width: percent + '%' }" />
    </div>
    <div class="automation-progress-bar__actions">
      <template v-if="status.status === 'running'">
        <button class="btn btn-ghost" @click="onCancel">取消</button>
      </template>
      <template v-else-if="status.status === 'paused'">
        <button class="btn btn-primary" @click="onResume">继续</button>
        <button class="btn btn-ghost" @click="onAbort">终止</button>
      </template>
      <template v-else-if="status.status === 'failed'">
        <span class="error-text">{{ status.error || '未知错误' }}</span>
        <button class="btn btn-primary" @click="onResume">重试</button>
        <button class="btn btn-ghost" @click="onAbort">终止</button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useAutomationStatus } from '@/composables/automation/useAutomationStatus'
import { automationAPI, type AutomationStatusPayload } from '@/composables/useApi'
import { toast } from 'vue-sonner'
import '@/assets/automation.css'

const props = withDefaults(defineProps<{ episodeId: number; refreshSignal?: number }>(), {
  refreshSignal: 0,
})
const emit = defineEmits<{
  (event: 'status-change', status: AutomationStatusPayload): void
}>()
const STAGE_INDEX: Record<string, number> = {
  extract: 1, character_image: 2, scene_image: 3, shot_image: 4, video: 4, merge: 5, done: 5,
}
const { status, start, stop, refresh } = useAutomationStatus(
  () => props.episodeId,
  () => props.refreshSignal,
)

watch(() => props.episodeId, async (v) => { stop(); if (v) await start() }, { immediate: true })
watch(status, value => { if (value) emit('status-change', value) })

const stageOrdinal = computed(() => status.value ? STAGE_INDEX[status.value.stage] ?? 0 : 0)
const percent = computed(() => {
  const s = status.value
  if (!s) return 0
  const stageBase = (stageOrdinal.value - 1) / 5 * 100
  const inStage = s.progress.total > 0 ? (s.progress.current / s.progress.total) * (100 / 5) : 0
  return Math.min(100, Math.round(stageBase + inStage))
})

async function onCancel() {
  try { await automationAPI.patch(props.episodeId, 'cancel'); toast.success('已取消'); await refresh() }
  catch (err: any) { toast.error(err?.message || '取消失败') }
}
async function onResume() {
  try { await automationAPI.patch(props.episodeId, 'resume'); toast.success('已继续'); await refresh() }
  catch (err: any) { toast.error(err?.message || '继续失败') }
}
async function onAbort() {
  try { await automationAPI.patch(props.episodeId, 'abort'); toast.success('已终止'); await refresh() }
  catch (err: any) { toast.error(err?.message || '终止失败') }
}
</script>
