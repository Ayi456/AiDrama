<template>
  <div v-if="show" class="step-bubble">
    <button
      v-if="panel === 'script'"
      class="bubble-btn"
      :disabled="scriptStep === 0"
      @click="emit('go-prev-step')"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
      </svg>
      {{ prevStepLabel || '上一步' }}
    </button>
    <button
      v-else-if="panel === 'production'"
      class="bubble-btn"
      :disabled="prodTabIdx === 0"
      @click="emit('go-prev-prod')"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
      </svg>
      {{ prodTabDefs[Math.max(0, prodTabIdx - 1)]?.label || '上一步' }}
    </button>

    <div class="bubble-dots">
      <button
        v-for="step in bubbleSteps"
        :key="step.key"
        :class="['bubble-dot', { done: step.done, current: step.key === activeBubbleKey }]"
        @click="emit('go-sub-step', step.key)"
        :title="step.label"
      ></button>
    </div>

    <button
      v-if="panel === 'script'"
      class="bubble-btn primary"
      :disabled="!canGoNext"
      @click="emit('go-next-step')"
    >
      {{ nextStepLabel || '下一步' }}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
      </svg>
    </button>
    <button
      v-else-if="panel === 'production'"
      class="bubble-btn primary"
      :disabled="prodTabIdx >= prodTabDefs.length - 1 && !canExport"
      @click="emit('go-next-prod')"
    >
      {{ prodTabIdx < prodTabDefs.length - 1 ? (prodTabDefs[prodTabIdx + 1]?.label || '下一步') : '进入导出' }}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  panel: {
    type: String,
    default: 'script',
  },
  scriptStep: {
    type: Number,
    default: 0,
  },
  prodTab: {
    type: String,
    default: '',
  },
  prodTabIdx: {
    type: Number,
    default: 0,
  },
  prodTabDefs: {
    type: Array,
    default: () => [],
  },
  bubbleSteps: {
    type: Array,
    default: () => [],
  },
  activeBubbleKey: {
    type: String,
    default: '',
  },
  canGoNext: {
    type: Boolean,
    default: false,
  },
  canExport: {
    type: Boolean,
    default: false,
  },
  prevStepLabel: {
    type: String,
    default: '',
  },
  nextStepLabel: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['go-sub-step', 'go-prev-step', 'go-next-step', 'go-prev-prod', 'go-next-prod'])
</script>
