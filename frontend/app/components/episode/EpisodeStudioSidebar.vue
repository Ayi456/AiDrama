<template>
  <aside class="sidebar">
    <nav class="pipeline">
      <div
        v-for="section in sidebarSections"
        :key="section.id"
        class="pipe-section"
      >
        <div class="pipe-section-label">{{ section.label }}</div>
        <button
          v-for="item in section.items"
          :key="item.key"
          :class="['pipe-item pipe-item-sub', { active: activeSubStepKey === item.key, done: item.done }]"
          @click="emit('go-sub-step', item.key)"
        >
          <span class="pipe-icon" :class="item.done ? 'icon-done' : activeSubStepKey === item.key ? 'icon-active' : ''">
            <svg v-if="item.done" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            <component v-else :is="item.icon" :size="11" />
          </span>
          <span class="pipe-copy">
            <span class="pipe-label">{{ item.label }}</span>
            <span v-if="item.desc" class="pipe-sub">{{ item.desc }}</span>
          </span>
        </button>
      </div>
    </nav>

    <div class="sidebar-bottom">
      <div class="progress-wrap">
        <div class="progress-head">
          <span class="progress-label">制作进度</span>
          <span class="progress-val">{{ pipelineProgress }}/7</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${pipelineProgress / 7 * 100}%` }"></div>
        </div>
      </div>
      <div v-if="sidebarJumpSteps.length" class="sidebar-jumper">
        <button
          v-for="step in sidebarJumpSteps"
          :key="step.key"
          :class="['sidebar-jump-dot', { active: activeSubStepKey === step.key, done: step.done }]"
          :title="step.label"
          @click="emit('go-sub-step', step.key)"
        ></button>
      </div>
      <button class="refresh-btn" @click="emit('refresh')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        刷新数据
      </button>
    </div>
  </aside>
</template>

<script setup>
defineProps({
  sidebarSections: {
    type: Array,
    default: () => [],
  },
  activeSubStepKey: {
    type: String,
    default: '',
  },
  pipelineProgress: {
    type: Number,
    default: 0,
  },
  sidebarJumpSteps: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['go-sub-step', 'refresh'])
</script>
