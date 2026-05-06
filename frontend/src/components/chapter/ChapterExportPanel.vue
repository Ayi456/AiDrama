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
        <div v-if="isMerging" class="merge-loading-state">
          <Loader2 :size="34" class="animate-spin merge-loading-state__icon" />
          <div class="empty-title">正在拼接视频</div>
          <div class="empty-desc">已提交 {{ selectedCount }} 个镜头，完成后会自动刷新结果</div>
        </div>
        <template v-else-if="mergeUrl">
          <video :src="assetUrl(mergeUrl)" controls class="export-video" />
          <div class="export-bar">
            <span class="tag tag-success">拼接完成</span>
            <span class="dim" style="font-size:12px">选中 {{ selectedCount }}/{{ clipCount }} 个可用镜头</span>
            <button class="btn btn-ghost ml-auto" :disabled="mergeDisabled" @click="emitMerge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>
              重新拼接选中
            </button>
            <a :href="assetUrl(mergeUrl)" download class="btn btn-primary">
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
            <div class="empty-title">拼接选中镜头</div>
            <div class="empty-desc">将 {{ selectedCount }}/{{ clipCount }} 个已生成镜头视频拼接为完整视频</div>
            <button class="btn btn-primary" :disabled="mergeDisabled" @click="emitMerge" style="margin-top:12px">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              拼接选中 {{ selectedCount }} 个
            </button>
          </div>
        </template>
      </div>
      <div class="export-list">
        <div class="export-list-head">
          <span>镜头概览</span>
          <span>{{ selectedCount }}/{{ clipCount }}</span>
        </div>
        <div class="export-list-actions">
          <button class="btn btn-sm" :disabled="isMerging || clipCount === 0 || selectedCount === clipCount" @click="selectAll">全选</button>
          <button class="btn btn-sm" :disabled="isMerging || selectedCount === 0" @click="clearSelection">清空</button>
        </div>
        <div class="export-list-body">
          <button
            v-for="(sb, i) in sbs"
            :key="sb.id"
            type="button"
            :class="['exp-row', { selected: isSelected(sb), disabled: !hasClip(sb) }]"
            :disabled="isMerging || !hasClip(sb)"
            @click="toggleStoryboard(sb)"
          >
            <span :class="['exp-check', isSelected(sb) && 'checked']">
              <Check v-if="isSelected(sb)" :size="11" />
            </span>
            <span class="mono dim" style="font-size:10px">#{{ String(i + 1).padStart(2, '0') }}</span>
            <span class="truncate" style="flex:1;font-size:11px">{{ sb.description || sb.title || '—' }}</span>
            <span class="exp-row-status">{{ hasClip(sb) ? (isSelected(sb) ? '已选' : '可选') : '无视频' }}</span>
            <span :class="['dot', hasClip(sb) && 'ok']" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Check, Loader2 } from 'lucide-vue-next'
import { assetUrl } from '@/utils/asset-url'

const props = defineProps({
  sbs: {
    type: Array,
    default: () => [],
  },
  mergeUrl: {
    type: String,
    default: '',
  },
  clipCount: {
    type: Number,
    default: 0,
  },
  totalDuration: {
    type: Number,
    default: 0,
  },
  hasClip: {
    type: Function,
    default: () => false,
  },
  selectedStoryboardIds: {
    type: Array,
    default: () => [],
  },
  isMerging: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['go-script', 'merge', 'update:selected-storyboard-ids'])

const selectedSet = computed(() => new Set(props.selectedStoryboardIds.map(Number)))
const availableIds = computed(() => props.sbs.filter(sb => props.hasClip(sb)).map(sb => Number(sb.id)))
const selectedIds = computed(() => availableIds.value.filter(id => selectedSet.value.has(id)))
const selectedCount = computed(() => selectedIds.value.length)
const mergeDisabled = computed(() => props.isMerging || selectedCount.value === 0)

function setSelected(ids) {
  emit('update:selected-storyboard-ids', ids)
}

function isSelected(storyboard) {
  return selectedSet.value.has(Number(storyboard?.id))
}

function toggleStoryboard(storyboard) {
  if (!props.hasClip(storyboard)) return
  const id = Number(storyboard.id)
  const next = isSelected(storyboard)
    ? selectedIds.value.filter(item => item !== id)
    : [...selectedIds.value, id]
  setSelected(next)
}

function selectAll() {
  setSelected(availableIds.value)
}

function clearSelection() {
  setSelected([])
}

function emitMerge() {
  if (mergeDisabled.value) return
  emit('merge', { storyboardIds: selectedIds.value })
}
</script>
