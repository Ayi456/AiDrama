<template>
  <div v-if="gridDialog" class="overlay" @click.self="emit('close-grid-dialog')">
    <div class="card grid-tool">
      <div class="grid-tool-head">
        <span class="shot-frames__dialog-title">宫格图工具</span>
        <button class="btn btn-ghost btn-icon ml-auto" @click="emit('close-grid-dialog')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div v-if="gridStep === 0" class="grid-tool-body">
        <div class="grid-mode-tabs">
          <button
            v-for="m in gridModes"
            :key="m.id"
            :class="['grid-mode-tab', { active: gridMode === m.id }]"
            @click="emit('change-grid-mode', m.id)"
          >
            <span style="font-weight:600">{{ m.label }}</span>
            <span class="dim" style="font-size:11px">{{ m.desc }}</span>
          </button>
        </div>

        <div class="grid-config">
          <label v-if="gridMode !== 'multi_ref'" class="field" style="flex:0 0 auto">
            <span class="field-label">宫格</span>
            <BaseSelect
              :model-value="gridLayout"
              :options="gridLayoutOptions"
              placeholder="宫格"
              style="width:90px"
              @update:model-value="emit('change-grid-layout', $event)"
            />
          </label>
          <div class="field" style="flex:1">
            <span class="field-label">
              {{ gridMode === 'multi_ref' ? '选择目标镜头' : '选择镜头' }}
              <span v-if="gridMode !== 'multi_ref'" class="dim">(已选 {{ gridSelected.length }})</span>
            </span>
          </div>
          <div v-if="gridMode !== 'multi_ref'" style="align-self:flex-end">
            <button class="btn btn-sm" @click="emit('toggle-grid-select-all')">{{ gridSelected.length === sbs.length ? '取消全选' : '全选' }}</button>
          </div>
        </div>

        <div class="grid-pick-list">
          <label
            v-for="(sb, i) in sbs"
            :key="sb.id"
            :class="['grid-pick-item', { selected: gridMode === 'multi_ref' ? gridSingleTarget === sb.id : gridSelected.includes(sb.id) }]"
          >
            <input
              v-if="gridMode === 'multi_ref'"
              type="radio"
              :checked="gridSingleTarget === sb.id"
              name="grid-target"
              @change="emit('change-grid-single-target', sb.id)"
            />
            <input
              v-else
              type="checkbox"
              :checked="gridSelected.includes(sb.id)"
              @change="emit('toggle-grid-shot', { id: sb.id, checked: $event.target.checked })"
            />
            <span class="mono" style="font-size:11px;width:28px">#{{ String(i + 1).padStart(2, '0') }}</span>
            <span class="truncate" style="flex:1;font-size:12px">{{ sb.description || sb.title || '—' }}</span>
          </label>
        </div>

        <div class="grid-tool-foot">
          <span v-if="gridCanStart" class="tag mono">{{ gridAutoLayout.rows }}x{{ gridAutoLayout.cols }} = {{ gridAutoLayout.rows * gridAutoLayout.cols }}格</span>
          <span class="dim" style="font-size:11px">{{ gridPromptLoading ? gridPromptStatus : gridSummary }}</span>
          <button class="btn btn-primary ml-auto" :disabled="!gridCanStart || gridPromptLoading" @click="emit('generate-grid-prompt')">
            <Loader2 v-if="gridPromptLoading" :size="12" class="animate-spin" />
            <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {{ gridPromptLoading ? '生成中' : '生成提示词' }}
          </button>
        </div>
      </div>

      <div v-else-if="gridStep === 1" class="grid-tool-body">
        <div class="grid-prompt-summary">
          <div class="grid-prompt-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            宫格图提示词
            <span v-if="gridPromptSource" class="tag ml-8">{{ gridPromptSource === 'agent' ? 'AI生成' : '模板兜底' }}</span>
          </div>
          <div class="grid-prompt-text">{{ gridPromptText || '（等待生成）' }}</div>
        </div>

        <div class="grid-blank-preview" :style="gridBlankStyle">
          <div v-for="(cell, i) in gridCellPrompts" :key="i" class="grid-blank-cell">
            <div class="grid-blank-cell-index">#{{ cell.shot_number }} {{ { first_frame: '首帧', last_frame: '尾帧', reference: '参考' }[cell.frame_type] || '' }}</div>
            <div class="grid-blank-cell-desc">{{ cell.prompt }}</div>
          </div>
          <div v-for="i in Math.max(0, (gridAutoLayout.rows * gridAutoLayout.cols) - gridCellPrompts.length)" :key="'empty-' + i" class="grid-blank-cell empty">
            <div class="grid-blank-cell-index">空</div>
            <div class="grid-blank-cell-desc">—</div>
          </div>
        </div>

        <div class="grid-tool-foot">
          <button class="btn" @click="emit('change-grid-step', 0)">上一步</button>
          <button class="btn ml-auto" :disabled="gridPromptLoading" @click="emit('generate-grid-prompt')">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            重新生成
          </button>
          <button class="btn btn-primary" @click="emit('start-grid-generation')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            生成宫格图
          </button>
        </div>
      </div>

      <div v-else-if="gridStep === 2" class="grid-tool-body shot-frames__loading-step">
        <Loader2 :size="28" class="animate-spin" style="color:var(--accent)" />
        <div class="loading-text" style="margin-top:12px">宫格图生成中...</div>
        <div class="dim" style="font-size:11px;margin-top:6px">{{ gridStatusText }}</div>
      </div>

      <div v-else-if="gridStep === 3" class="grid-tool-body grid-tool-body-preview">
        <div class="grid-preview-layout">
          <div class="grid-preview-pane">
            <div class="grid-preview-wrap">
              <div class="grid-preview-stage">
                <img
                  :src="assetUrl(gridImagePath)"
                  class="grid-preview-img previewable-image"
                  @click.stop="openViewer(assetUrl(gridImagePath), '宫格图预览')"
                />
                <div class="grid-overlay" :style="gridOverlayStyle">
                  <button
                    v-for="(assignment, i) in gridAssignments"
                    :key="i"
                    type="button"
                    :class="['grid-overlay-cell', activeGridCell === i && 'active']"
                    @click="emit('focus-grid-cell', i)"
                  >
                    <span class="grid-cell-label">{{ gridCellLabel(assignment) }}</span>
                  </button>
                </div>
              </div>
            </div>
            <div class="grid-adjust-summary">
              <span class="tag mono">{{ gridActualLayout.rows }}x{{ gridActualLayout.cols }} = {{ gridActualLayout.rows * gridActualLayout.cols }}格</span>
              <span class="dim" style="font-size:12px">{{ gridAssignedCount }}/{{ gridAssignments.length }} 格已分配</span>
              <span v-if="gridAssignedCount < gridAssignments.length" class="tag">未分配格子会被忽略，不会写回分镜</span>
            </div>
          </div>

          <div class="grid-assignment-pane">
            <div class="grid-assign-head">
              <div class="grid-assign-title">格子分配</div>
              <div class="grid-assign-subtitle">切分后由你自己决定每格对应哪个分镜</div>
            </div>
            <div v-if="gridAssignmentTotalPages > 1" class="grid-assign-pagination">
              <button class="btn btn-sm" :disabled="gridAssignmentPage === 0" @click="emit('change-grid-assignment-page', gridAssignmentPage - 1)">上一页</button>
              <span class="dim">第 {{ gridAssignmentPage + 1 }}/{{ gridAssignmentTotalPages }} 页</span>
              <span class="dim">{{ gridAssignmentPageStart + 1 }}-{{ gridAssignmentPageEnd }} / {{ gridAssignments.length }}</span>
              <button class="btn btn-sm ml-auto" :disabled="gridAssignmentPage >= gridAssignmentTotalPages - 1" @click="emit('change-grid-assignment-page', gridAssignmentPage + 1)">下一页</button>
            </div>
            <div class="grid-assign-columns">
              <span>格</span>
              <span>镜头</span>
              <span>类型</span>
              <span>当前绑定</span>
            </div>
            <div class="grid-assign-info">
              <div
                v-for="item in pagedGridAssignments"
                :key="item.index"
                :class="['grid-assign-row', activeGridCell === item.index && 'active']"
              >
                <span class="grid-assign-index">格{{ item.index + 1 }}</span>
                <BaseSelect
                  :model-value="item.assignment.storyboard_id"
                  :options="gridAssignmentShotOptions"
                  placeholder="选择镜头"
                  @update:model-value="emit('update-grid-assignment', { index: item.index, field: 'storyboard_id', value: $event })"
                />
                <BaseSelect
                  :model-value="item.assignment.frame_type"
                  :options="gridFrameTypeOptions"
                  placeholder="帧类型"
                  style="width:100%"
                  @update:model-value="emit('update-grid-assignment', { index: item.index, field: 'frame_type', value: $event })"
                />
                <span class="grid-assign-bind">{{ gridCellTitle(item.assignment.storyboard_id) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="grid-tool-foot">
          <button class="btn" @click="emit('change-grid-step', 1)">返回</button>
          <button class="btn btn-primary ml-auto" @click="emit('do-grid-split')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            切分并分配
          </button>
        </div>
      </div>

      <div v-else-if="gridStep === 4" class="grid-tool-body shot-frames__done-step">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        <div class="shot-frames__done-title">分配完成</div>
        <div class="dim" style="font-size:13px;margin-top:4px">{{ gridAssignedCount }} 格已分配</div>
        <button class="btn btn-primary" style="margin-top:16px" @click="emit('finish-grid-dialog')">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Loader2 } from 'lucide-vue-next'
import BaseSelect from '@/components/BaseSelect.vue'
import { assetUrl } from '@/utils/asset-url'

defineProps({
  sbs: { type: Array, default: () => [] },
  gridDialog: { type: Boolean, default: false },
  gridStep: { type: Number, default: 0 },
  gridModes: { type: Array, default: () => [] },
  gridMode: { type: String, default: 'first_frame' },
  gridLayout: { type: String, default: '3x3' },
  gridLayoutOptions: { type: Array, default: () => [] },
  gridSelected: { type: Array, default: () => [] },
  gridSingleTarget: { type: Number, default: null },
  gridCanStart: { type: Boolean, default: false },
  gridAutoLayout: { type: Object, default: () => ({ rows: 3, cols: 3 }) },
  gridPromptLoading: { type: Boolean, default: false },
  gridPromptStatus: { type: String, default: '' },
  gridSummary: { type: String, default: '' },
  gridPromptSource: { type: String, default: '' },
  gridPromptText: { type: String, default: '' },
  gridCellPrompts: { type: Array, default: () => [] },
  gridBlankStyle: { type: Object, default: () => ({}) },
  gridStatusText: { type: String, default: '' },
  gridImagePath: { type: String, default: '' },
  gridOverlayStyle: { type: Object, default: () => ({}) },
  gridAssignments: { type: Array, default: () => [] },
  activeGridCell: { type: Number, default: 0 },
  gridAssignedCount: { type: Number, default: 0 },
  gridAssignmentTotalPages: { type: Number, default: 1 },
  gridAssignmentPage: { type: Number, default: 0 },
  gridAssignmentPageStart: { type: Number, default: 0 },
  gridAssignmentPageEnd: { type: Number, default: 0 },
  pagedGridAssignments: { type: Array, default: () => [] },
  gridAssignmentShotOptions: { type: Array, default: () => [] },
  gridFrameTypeOptions: { type: Array, default: () => [] },
  gridActualLayout: { type: Object, default: () => ({ rows: 3, cols: 3 }) },
  gridCellLabel: { type: Function, required: true },
  gridCellTitle: { type: Function, required: true },
})

const emit = defineEmits([
  'close-grid-dialog',
  'change-grid-mode',
  'change-grid-layout',
  'toggle-grid-select-all',
  'toggle-grid-shot',
  'change-grid-single-target',
  'generate-grid-prompt',
  'start-grid-generation',
  'change-grid-step',
  'focus-grid-cell',
  'change-grid-assignment-page',
  'update-grid-assignment',
  'do-grid-split',
  'finish-grid-dialog',
  'open-image-viewer',
])

function openViewer(src, title) {
  emit('open-image-viewer', { src, title })
}
</script>
