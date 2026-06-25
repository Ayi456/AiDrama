<template>
  <header class="studio-topbar">
    <div class="studio-topbar-main">
      <button class="back-btn topbar-back" @click="emit('back')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
        返回项目
      </button>
      <div class="studio-identity">
        <h1 class="studio-title">{{ dramaTitle }}</h1>
        <span class="studio-episode-chip">Chapter {{ chapterNumber }}</span>
        <div class="studio-meta-row">
          <span class="studio-meta-pill">{{ currentSubStageLabel }}</span>
          <span class="studio-meta-pill is-progress">{{ pipelineProgress }}/{{ pipelineTotal }}</span>
          <span class="studio-meta-inline">{{ characterCount }} 角色 · {{ shotCount }} 镜头</span>
        </div>
      </div>
    </div>

    <div class="studio-topbar-side">
      <div class="studio-actions">
        <button class="btn" @click="emit('refresh')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          刷新
        </button>
        <button class="btn btn-primary" @click="emit('primary-action')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          {{ primaryActionLabel }}
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  dramaTitle: {
    type: String,
    default: '',
  },
  chapterNumber: {
    type: Number,
    required: true,
  },
  currentSubStageLabel: {
    type: String,
    default: '',
  },
  pipelineProgress: {
    type: Number,
    default: 0,
  },
  pipelineTotal: {
    type: Number,
    default: 9,
  },
  characterCount: {
    type: Number,
    default: 0,
  },
  shotCount: {
    type: Number,
    default: 0,
  },
  hasMergeOutput: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['back', 'refresh', 'primary-action'])

const primaryActionLabel = computed(() => (
  props.hasMergeOutput ? '查看成片' : (props.shotCount ? '继续制作' : '开始制作')
))
</script>
