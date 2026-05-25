<template>
  <section class="automation-card">
    <h3 class="automation-card__title">一键自动化</h3>

    <label class="automation-card__field">
      <span class="field-label">启用一键自动化</span>
      <label class="toggle">
        <input type="checkbox" :checked="prefs.autoPipelineEnabled" @change="onToggle" />
        <span />
      </label>
    </label>

    <label class="automation-card__field">
      <span class="field-label">失败重试次数</span>
      <input class="input" type="number" min="0" max="5" :value="prefs.autoPipelineMaxRetries" @change="onNumber('autoPipelineMaxRetries', $event)" />
    </label>

    <label class="automation-card__field">
      <span class="field-label">图片并发上限</span>
      <input class="input" type="number" min="1" max="16" :value="prefs.autoPipelineConcurrencyImage" @change="onNumber('autoPipelineConcurrencyImage', $event)" />
    </label>

    <label class="automation-card__field">
      <span class="field-label">视频并发上限</span>
      <input class="input" type="number" min="1" max="8" :value="prefs.autoPipelineConcurrencyVideo" @change="onNumber('autoPipelineConcurrencyVideo', $event)" />
    </label>

    <p class="automation-card__hint">开启后，进入任意章节并导入小说后，会看到「一键开始」按钮。</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useAutomationPreferences } from '@/composables/automation/useAutomationPreferences'
import '@/assets/automation.css'

const { prefs, load, save } = useAutomationPreferences()

onMounted(load)

function onToggle(e: Event) {
  const enabled = (e.target as HTMLInputElement).checked
  save({ autoPipelineEnabled: enabled })
}

function onNumber(field: 'autoPipelineMaxRetries' | 'autoPipelineConcurrencyImage' | 'autoPipelineConcurrencyVideo', e: Event) {
  const value = Number((e.target as HTMLInputElement).value)
  if (!Number.isFinite(value) || value < 0) return
  save({ [field]: value } as any)
}
</script>
