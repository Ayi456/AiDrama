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
            <button
              class="btn btn-ghost ml-auto"
              type="button"
              :title="transitionSummary"
              @click="openTransitionDialog"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              过渡
            </button>
            <button class="btn btn-ghost" :disabled="mergeDisabled" @click="emitMerge">
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
            <div class="empty-actions">
              <button class="btn btn-ghost" type="button" @click="openTransitionDialog">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                过渡 <span class="dim">{{ transitionSummary }}</span>
              </button>
              <button class="btn btn-primary" :disabled="mergeDisabled" @click="emitMerge">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                拼接选中 {{ selectedCount }} 个
              </button>
            </div>
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
          <template v-for="(sb, i) in sbs" :key="sb.id">
            <button
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
            <div
              v-if="i < sbs.length - 1"
              :class="['exp-seam', { 'exp-seam--custom': !seamInherited(sb) }]"
              role="button"
              tabindex="0"
              :title="`${seamLabelFor(i)} 过渡：${seamSummary(sb)}`"
              @click="openSeamDialog(sb, i)"
              @keydown.enter="openSeamDialog(sb, i)"
            >
              <span class="exp-seam__line" />
              <span class="exp-seam__chip">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="7" height="14" rx="1"/><rect x="14" y="5" width="7" height="14" rx="1"/><path d="M10 12h4"/></svg>
                {{ seamSummary(sb) }}
              </span>
              <span class="exp-seam__line" />
            </div>
          </template>
        </div>
      </div>
    </div>
    <ChapterTransitionDialog
      :open="transitionDialogOpen"
      :type="transitionType || 'fade'"
      :duration-ms="transitionDurationMs ?? 500"
      :saving="transitionSaving"
      @close="transitionDialogOpen = false"
      @save="onTransitionSave"
    />
    <ChapterTransitionDialog
      :open="seamDialogOpen"
      mode="seam"
      :seam-label="activeSeamLabel"
      :inherited="seamInherited(activeSeamStoryboard)"
      :type="activeSeamDialogType"
      :duration-ms="activeSeamDialogDuration"
      :saving="transitionSaving"
      @close="seamDialogOpen = false"
      @save="onSeamTransitionSave"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Check, Loader2 } from 'lucide-vue-next'
import { assetUrl } from '@/utils/asset-url'
import ChapterTransitionDialog from './ChapterTransitionDialog.vue'

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
  transitionType: {
    type: String,
    default: '',
  },
  transitionDurationMs: {
    type: Number,
    default: null,
  },
  transitionSaving: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'go-script',
  'merge',
  'update:selected-storyboard-ids',
  'save-transition',
  'save-seam-transition',
])

const selectedSet = computed(() => new Set(props.selectedStoryboardIds.map(Number)))
const availableIds = computed(() => props.sbs.filter(sb => props.hasClip(sb)).map(sb => Number(sb.id)))
const selectedIds = computed(() => availableIds.value.filter(id => selectedSet.value.has(id)))
const selectedCount = computed(() => selectedIds.value.length)
const mergeDisabled = computed(() => props.isMerging || selectedCount.value === 0)

const transitionDialogOpen = ref(false)
const seamDialogOpen = ref(false)
const activeSeamStoryboard = ref(null)
const activeSeamIndex = ref(-1)

const TYPE_LABELS = {
  fade: '淡入淡出',
  fadeblack: '淡入黑场',
  fadewhite: '淡入白场',
  slideleft: '向左滑',
  slideright: '向右滑',
  slideup: '向上滑',
  circleopen: '圆形展开',
  circleclose: '圆形收拢',
  wipeleft: '左向擦除',
  pixelize: '像素溶解',
}

function typeLabel(type) {
  return TYPE_LABELS[type] || '淡入淡出'
}

const transitionSummary = computed(() => {
  const dur = Number(props.transitionDurationMs)
  if (!Number.isFinite(dur) || dur <= 0) return '关闭'
  return `${typeLabel(props.transitionType)} · ${dur}ms`
})

function seamType(storyboard) {
  return storyboard?.transition_type ?? storyboard?.transitionType ?? null
}

function seamDuration(storyboard) {
  const value = storyboard?.transition_duration_ms ?? storyboard?.transitionDurationMs
  return value == null ? null : Number(value)
}

function seamInherited(storyboard) {
  return seamDuration(storyboard) == null
}

function seamSummary(storyboard) {
  const dur = seamDuration(storyboard)
  if (dur == null) return `默认 · ${transitionSummary.value}`
  if (!Number.isFinite(dur) || dur <= 0) return '硬切'
  return `${typeLabel(seamType(storyboard))} · ${dur}ms`
}

function seamLabelFor(index) {
  const left = String(index + 1).padStart(2, '0')
  const right = String(index + 2).padStart(2, '0')
  return `镜头 ${left} → ${right}`
}

const activeSeamDialogType = computed(() => {
  const dur = seamDuration(activeSeamStoryboard.value)
  if (dur != null && dur > 0) return seamType(activeSeamStoryboard.value) || props.transitionType || 'fade'
  return props.transitionType || 'fade'
})

const activeSeamDialogDuration = computed(() => {
  const dur = seamDuration(activeSeamStoryboard.value)
  if (dur == null) return props.transitionDurationMs ?? 500
  return dur
})

const activeSeamLabel = computed(() => (
  activeSeamIndex.value >= 0 ? seamLabelFor(activeSeamIndex.value) : ''
))

function openTransitionDialog() {
  transitionDialogOpen.value = true
}

function openSeamDialog(storyboard, index) {
  activeSeamStoryboard.value = storyboard
  activeSeamIndex.value = index
  seamDialogOpen.value = true
}

function onTransitionSave(payload) {
  emit('save-transition', payload)
  transitionDialogOpen.value = false
}

function onSeamTransitionSave(payload) {
  const storyboard = activeSeamStoryboard.value
  if (!storyboard) {
    seamDialogOpen.value = false
    return
  }
  const resolved = payload?.inherit
    ? { type: null, durationMs: null }
    : { type: payload?.type ?? null, durationMs: payload?.durationMs ?? 0 }
  emit('save-seam-transition', { storyboardId: Number(storyboard.id), ...resolved })
  seamDialogOpen.value = false
}

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

<style scoped>
.empty-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 12px;
  flex-wrap: wrap;
}
.exp-seam {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  cursor: pointer;
  user-select: none;
}
.exp-seam__line {
  flex: 1;
  height: 1px;
  background: rgba(31, 36, 51, 0.12);
}
.exp-seam__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px dashed rgba(31, 36, 51, 0.25);
  border-radius: 999px;
  font-size: 10px;
  color: #6b7280;
  white-space: nowrap;
  transition: all 0.15s;
}
.exp-seam:hover .exp-seam__chip {
  border-color: #4f7cff;
  color: #2649c0;
  background: rgba(79, 124, 255, 0.08);
}
.exp-seam--custom .exp-seam__chip {
  border-style: solid;
  border-color: rgba(79, 124, 255, 0.5);
  color: #2649c0;
  background: rgba(79, 124, 255, 0.06);
}
</style>
