<template>
  <div class="content-panel">
    <div v-if="!sbs.length" class="step-empty" style="flex:1">
      <div class="empty-visual">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </div>
      <div class="empty-title">尚未准备就绪</div>
      <div class="empty-desc">请先完成分镜和制作流程</div>
      <button class="btn btn-primary" @click="emit('go-script')">前往剧本</button>
    </div>
    <div v-else class="export-split">
      <div class="export-main">
        <template v-if="mergeUrl">
          <video :src="'/' + mergeUrl" controls class="export-video" />
          <div class="export-bar">
            <span class="tag tag-success">拼接完成</span>
            <span class="dim" style="font-size:12px">{{ sbs.length }} 镜头 · {{ totalDuration }}s</span>
            <button class="btn btn-ghost ml-auto" :disabled="composedCount === 0" @click="emit('merge')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>
              重新拼接
            </button>
            <a :href="'/' + mergeUrl" download class="btn btn-primary">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              下载视频
            </a>
          </div>
        </template>
        <template v-else>
          <div class="step-empty">
            <div class="empty-visual">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            </div>
            <div class="empty-title">拼接全集视频</div>
            <div class="empty-desc">将 {{ composedCount }}/{{ sbs.length }} 个已合成镜头拼接为完整视频</div>
            <button class="btn btn-primary" :disabled="composedCount === 0" @click="emit('merge')" style="margin-top:12px">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              开始拼接
            </button>
          </div>
        </template>
      </div>
      <div class="export-list">
        <div class="export-list-head">镜头概览</div>
        <div class="export-list-body">
          <div v-for="(sb, i) in sbs" :key="sb.id" class="exp-row">
            <span class="mono dim" style="font-size:10px">#{{ String(i + 1).padStart(2, '0') }}</span>
            <span class="truncate" style="flex:1;font-size:11px">{{ sb.description || sb.title || '—' }}</span>
            <span :class="['dot', hasComposed(sb) && 'ok']" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  sbs: {
    type: Array,
    default: () => [],
  },
  mergeUrl: {
    type: String,
    default: '',
  },
  composedCount: {
    type: Number,
    default: 0,
  },
  totalDuration: {
    type: Number,
    default: 0,
  },
  hasComposed: {
    type: Function,
    default: () => false,
  },
})

const emit = defineEmits(['go-script', 'merge'])
</script>
