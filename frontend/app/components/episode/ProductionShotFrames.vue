<template>
  <div class="shot-frames">
    <div class="shot-frames__toolbar">
      <span class="dim shot-frames__meta">{{ sbs.length }} 个镜头</span>
      <span class="tag mono">{{ shotImgCount }}/{{ sbs.length }} 已有帧图</span>
      <span class="tag">{{ lockedImageConfigLabel }}</span>
      <div class="shot-frames__toolbar-actions">
        <BaseSelect
          :model-value="frameMode"
          :options="frameModeOptions"
          placeholder="帧模式"
          searchable
          style="width:100px"
          @update:model-value="emit('change-frame-mode', $event)"
        />
        <button v-if="gridImagePath" class="btn btn-sm" @click="emit('reopen-grid-preview')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
          查看当前宫格图
        </button>
        <button class="btn btn-primary btn-sm" @click="emit('open-grid-tool')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          宫格图工具
        </button>
      </div>
    </div>

    <div v-if="gridHistory.length" class="grid-history-panel">
      <div v-if="gridImagePath" class="latest-grid-strip">
        <button class="latest-grid-strip-thumb" @click="openViewer(`/${gridImagePath}`, '当前宫格图')">
          <img :src="'/' + gridImagePath" class="previewable-image" />
        </button>
        <div class="latest-grid-strip-copy">
          <div class="latest-grid-strip-head">
            <span class="tag mono">{{ gridActualLayout.rows }}x{{ gridActualLayout.cols }}</span>
            <span v-if="gridRecoveredMode" class="tag">{{ gridRecoveredMode }}</span>
          </div>
          <div class="latest-grid-strip-title">当前宫格图</div>
          <div class="latest-grid-strip-meta">
            <span v-if="gridRecoveredAt">{{ gridRecoveredAt }}</span>
            <span>可继续切割并分配</span>
          </div>
        </div>
        <div class="latest-grid-strip-actions">
          <button class="btn btn-sm" @click="emit('reopen-grid-preview')">预览</button>
          <button class="btn btn-primary btn-sm" @click="emit('continue-grid-split')">继续切割</button>
        </div>
      </div>

      <div class="grid-history-head">
        <div>
          <div class="grid-history-title">历史宫格图</div>
          <div class="grid-history-subtitle">按需展开切换不同宫格图，不默认占用第一屏</div>
        </div>
        <button class="btn btn-sm" @click="emit('toggle-grid-history')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline :points="showAllGridHistory ? '18 15 12 9 6 15' : '6 9 12 15 18 9'"/></svg>
          {{ showAllGridHistory ? '收起历史宫格图' : `展开全部 (${gridHistory.length})` }}
        </button>
      </div>

      <div v-if="showAllGridHistory" class="grid-history-list">
        <button
          v-for="item in gridHistory"
          :key="item.id"
          :class="['grid-history-item', { active: item.localPath === gridImagePath }]"
          @click="emit('select-grid-history', item)"
        >
          <div class="grid-history-thumb">
            <img :src="'/' + item.localPath" class="previewable-image" />
          </div>
          <div class="grid-history-copy">
            <div class="grid-history-tags">
              <span class="tag mono">#{{ item.id }}</span>
              <span class="tag mono">{{ item.layout.rows }}x{{ item.layout.cols }}</span>
              <span class="tag">{{ item.modeLabel }}</span>
            </div>
            <div class="grid-history-meta">{{ item.createdAtLabel }}</div>
          </div>
        </button>
      </div>
    </div>

    <div class="frame-scroll">
      <div class="frame-grid">
        <div
          v-for="(sb, i) in sbs"
          :key="sb.id"
          :class="['frame-row', 'card', { active: selectedSbId === sb.id }]"
          @click="emit('select-shot', sb)"
        >
          <div class="frame-info">
            <div class="frame-top">
              <span class="frame-num">#{{ String(i + 1).padStart(2, '0') }}</span>
              <span class="frame-badge">{{ sb.shot_type || sb.shotType || '—' }}</span>
            </div>
            <div class="frame-desc">{{ sb.description || sb.title || '—' }}</div>
            <div class="frame-meta">
              <span :class="['dot', getFirstFrame(sb) && 'ok', isPendingShotFrame(sb.id, 'first_frame') && 'pending']" />
              <span class="dim" style="font-size:11px">首帧</span>
              <span v-if="frameMode === 'first_last'" class="shot-frames__tail-meta">
                <span :class="['dot', getLastFrame(sb) && 'ok', isPendingShotFrame(sb.id, 'last_frame') && 'pending']" />
                <span class="dim" style="font-size:11px">尾帧</span>
              </span>
            </div>
          </div>

          <div class="frame-thumbs">
            <div class="frame-thumb-wrap">
              <div class="frame-thumb" @click.stop="!isPendingShotFrame(sb.id, 'first_frame') && emit('generate-shot-frame', { sb, frameType: 'first_frame' })">
                <img
                  v-if="getFirstFrame(sb)"
                  :src="'/' + getFirstFrame(sb)"
                  class="previewable-image"
                  @click.stop="openViewer('/' + getFirstFrame(sb), `镜头 #${String(i + 1).padStart(2, '0')} 首帧`)"
                />
                <div v-else class="frame-thumb-empty">
                  <Loader2 v-if="isPendingShotFrame(sb.id, 'first_frame')" :size="14" class="animate-spin" />
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </div>
                <span v-if="getFirstFrame(sb)" class="frame-re">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                </span>
              </div>
              <span class="frame-thumb-label">{{ isPendingShotFrame(sb.id, 'first_frame') ? '首帧生成中' : '首帧' }}</span>
            </div>

            <div v-if="frameMode === 'first_last'" class="frame-thumb-wrap">
              <div class="frame-thumb" @click.stop="!isPendingShotFrame(sb.id, 'last_frame') && emit('generate-shot-frame', { sb, frameType: 'last_frame' })">
                <img
                  v-if="getLastFrame(sb)"
                  :src="'/' + getLastFrame(sb)"
                  class="previewable-image"
                  @click.stop="openViewer('/' + getLastFrame(sb), `镜头 #${String(i + 1).padStart(2, '0')} 尾帧`)"
                />
                <div v-else class="frame-thumb-empty">
                  <Loader2 v-if="isPendingShotFrame(sb.id, 'last_frame')" :size="14" class="animate-spin" />
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </div>
                <span v-if="getLastFrame(sb)" class="frame-re">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                </span>
              </div>
              <span class="frame-thumb-label">{{ isPendingShotFrame(sb.id, 'last_frame') ? '尾帧生成中' : '尾帧' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

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
                    :src="'/' + gridImagePath"
                    class="grid-preview-img previewable-image"
                    @click.stop="openViewer('/' + gridImagePath, '宫格图预览')"
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
  </div>
</template>

<script setup>
import { Loader2 } from 'lucide-vue-next'
import BaseSelect from '~/components/BaseSelect.vue'

defineProps({
  sbs: { type: Array, default: () => [] },
  shotImgCount: { type: Number, default: 0 },
  lockedImageConfigLabel: { type: String, default: '' },
  selectedSbId: { type: Number, default: 0 },
  frameMode: { type: String, default: 'first' },
  frameModeOptions: { type: Array, default: () => [] },
  gridImagePath: { type: String, default: '' },
  gridActualLayout: { type: Object, default: () => ({ rows: 3, cols: 3 }) },
  gridRecoveredMode: { type: String, default: '' },
  gridRecoveredAt: { type: String, default: '' },
  showAllGridHistory: { type: Boolean, default: false },
  gridHistory: { type: Array, default: () => [] },
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
  getFirstFrame: { type: Function, required: true },
  getLastFrame: { type: Function, required: true },
  isPendingShotFrame: { type: Function, required: true },
  gridCellLabel: { type: Function, required: true },
  gridCellTitle: { type: Function, required: true },
})

const emit = defineEmits([
  'change-frame-mode',
  'open-grid-tool',
  'reopen-grid-preview',
  'continue-grid-split',
  'toggle-grid-history',
  'select-grid-history',
  'select-shot',
  'generate-shot-frame',
  'open-image-viewer',
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
])

function openViewer(src, title) {
  emit('open-image-viewer', { src, title })
}
</script>

<style scoped>
.shot-frames {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.shot-frames__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.shot-frames__meta {
  font-size: 12px;
}

.shot-frames__toolbar-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.shot-frames__tail-meta {
  display: flex;
  align-items: center;
  gap: 4px;
}

.shot-frames__dialog-title {
  font-size: 15px;
  font-weight: 600;
  font-family: var(--font-display);
}

.shot-frames__loading-step,
.shot-frames__done-step {
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.shot-frames__done-title {
  margin-top: 8px;
  font-size: 17px;
  font-weight: 700;
  font-family: var(--font-display);
}

.frame-grid { display: flex; flex-direction: column; gap: 8px; }
.frame-row {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 14px; cursor: pointer;
  border-radius: var(--radius-lg);
  transition: all 0.15s;
  border: 1.5px solid transparent;
}
.frame-row:hover { background: var(--bg-0); border-color: var(--border); }
.frame-row.active {
  background: var(--bg-0);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
.frame-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.frame-top { display: flex; align-items: center; gap: 8px; }
.frame-num {
  font-size: 13px; font-family: var(--font-mono); font-weight: 800;
  color: var(--accent);
}
.frame-badge {
  font-size: 11px; font-weight: 600; padding: 2px 8px;
  border-radius: 20px;
  background: var(--accent-bg); color: var(--accent);
  border: 1px solid var(--accent-glow);
  white-space: nowrap;
}
.frame-desc {
  font-size: 12px; line-height: 1.5; color: var(--text-1);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.frame-meta { display: flex; align-items: center; gap: 6px; }
.frame-thumbs { display: flex; gap: 8px; flex-shrink: 0; }
.frame-thumb-wrap { display: flex; flex-direction: column; gap: 3px; align-items: center; }
.frame-thumb-label { font-size: 10px; font-weight: 600; color: var(--text-3); }
.frame-thumb {
  position: relative; width: 130px; aspect-ratio: 16/9;
  border-radius: 6px; overflow: hidden;
  background: var(--bg-2); cursor: pointer;
  transition: all 0.15s; border: 1.5px solid var(--border);
}
.frame-thumb:hover { border-color: var(--accent); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
.frame-thumb img { width: 100%; height: 100%; object-fit: cover; }
.frame-thumb-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.frame-re {
  position: absolute; top: 3px; right: 3px; width: 18px; height: 18px;
  border-radius: 50%; background: rgba(0,0,0,0.5); color: #fff;
  display: none; align-items: center; justify-content: center;
}
.frame-thumb:hover .frame-re { display: flex; }
.frame-scroll { flex: 1; overflow-y: auto; padding: 10px 12px; }
.previewable-image {
  cursor: zoom-in;
  transition: transform 0.18s var(--ease-out), filter 0.18s var(--ease-out);
}
.previewable-image:hover {
  transform: scale(1.015);
  filter: saturate(1.04);
}
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--bg-3); flex-shrink: 0; }
.dot.ok { background: var(--success); }
.dot.pending {
  background: var(--accent-dark);
  box-shadow: 0 0 0 3px rgba(76, 125, 255, 0.14);
}

.grid-tool { width: min(1320px, calc(100vw - 40px)); max-height: calc(100vh - 48px); display: flex; flex-direction: column; overflow: hidden; animation: scaleIn 0.2s var(--ease-out); }
.grid-tool-head { display: flex; align-items: center; gap: 8px; padding: 16px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.grid-tool-body { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
.grid-tool-body-preview { overflow: hidden; min-height: 0; padding-bottom: 10px; }
.grid-tool-foot { display: flex; align-items: center; gap: 8px; padding-top: 12px; border-top: 1px solid var(--border); margin-top: 4px; }
.grid-preview-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.72fr) minmax(340px, 400px);
  gap: 14px;
  min-height: 0;
  flex: 1;
  align-items: start;
}
.grid-preview-pane {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.grid-assignment-pane {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 18px;
  background: rgba(255,255,255,0.66);
  overflow: hidden;
  max-height: min(70vh, 840px);
}
.grid-assign-head {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.72));
}
.grid-assign-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-0);
  font-family: var(--font-display);
}
.grid-assign-subtitle {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
}
.grid-assign-pagination {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(255,255,255,0.86);
}
.grid-assign-columns {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 96px minmax(0, 1fr);
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(246, 248, 252, 0.92);
  font-size: 10px;
  font-weight: 700;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.grid-mode-tabs { display: flex; gap: 6px; }
.grid-mode-tab { flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: var(--radius); background: var(--bg-0); cursor: pointer; transition: all 0.15s; text-align: left; }
.grid-mode-tab:hover { border-color: var(--border-strong); }
.grid-mode-tab.active { border-color: var(--accent); background: var(--accent-bg); }
.grid-config { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; }
.grid-pick-list { display: flex; flex-direction: column; gap: 2px; max-height: 260px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius); padding: 4px; }
.grid-pick-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 4px; cursor: pointer; transition: background 0.1s; }
.grid-pick-item:hover { background: var(--bg-hover); }
.grid-pick-item.selected { background: var(--accent-bg); }
.grid-pick-item input { accent-color: var(--accent); }
.grid-preview-wrap {
  position: relative;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(8, 12, 18, 0.84);
  box-shadow: 0 18px 40px rgba(8, 14, 24, 0.18);
}
.grid-preview-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.grid-preview-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: rgba(0,0,0,0.2);
}
.grid-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  gap: 0;
  pointer-events: none;
}
.grid-overlay-cell {
  position: relative;
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(15, 23, 42, 0.08);
  pointer-events: auto;
  cursor: pointer;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
.grid-overlay-cell:hover {
  background: rgba(76, 125, 255, 0.16);
}
.grid-overlay-cell.active {
  box-shadow: inset 0 0 0 2px rgba(105, 161, 255, 0.86);
  background: rgba(76, 125, 255, 0.2);
}
.grid-cell-label {
  position: absolute;
  left: 8px;
  top: 8px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.7);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.grid-adjust-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.grid-assign-info {
  overflow-y: auto;
}
.grid-assign-row {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 96px minmax(0, 1fr);
  gap: 8px;
  padding: 10px 12px;
  align-items: center;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
}
.grid-assign-row.active {
  background: rgba(76, 125, 255, 0.08);
}
.grid-assign-row:last-child { border-bottom: 0; }
.grid-assign-index {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-1);
}
.grid-assign-bind {
  min-width: 0;
  font-size: 11px;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.grid-prompt-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.grid-prompt-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-1);
}
.grid-prompt-text {
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-1);
  white-space: pre-wrap;
}
.grid-blank-preview {
  display: grid;
  gap: 8px;
}
.grid-blank-cell {
  min-height: 110px;
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(27, 41, 64, 0.08);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.grid-blank-cell.empty {
  opacity: 0.45;
}
.grid-blank-cell-index {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}
.grid-blank-cell-desc {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-1);
}
.grid-history-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.grid-history-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.grid-history-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-0);
}
.grid-history-subtitle {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-3);
}
.grid-history-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}
.grid-history-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border-radius: 18px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(255,255,255,0.7);
  text-align: left;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.grid-history-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 24px rgba(18, 35, 71, 0.08);
}
.grid-history-item.active {
  border-color: rgba(76, 125, 255, 0.28);
  box-shadow: 0 0 0 3px rgba(76, 125, 255, 0.12);
}
.grid-history-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(8, 12, 18, 0.7);
}
.grid-history-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.grid-history-copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.grid-history-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.grid-history-meta {
  font-size: 11px;
  color: var(--text-3);
}
.latest-grid-strip {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: stretch;
  padding: 12px;
  border-radius: 22px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.82), rgba(246,250,255,0.72));
}
.latest-grid-strip-thumb {
  border: none;
  padding: 0;
  border-radius: 16px;
  overflow: hidden;
  background: rgba(8, 12, 18, 0.74);
  cursor: pointer;
}
.latest-grid-strip-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  aspect-ratio: 16 / 9;
}
.latest-grid-strip-copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  min-width: 0;
}
.latest-grid-strip-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.latest-grid-strip-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-0);
  font-family: var(--font-display);
}
.latest-grid-strip-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-2);
}
.latest-grid-strip-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 1240px) {
  .grid-tool {
    width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
  }

  .grid-preview-layout {
    grid-template-columns: 1fr;
  }

  .grid-preview-wrap,
  .grid-preview-img {
    max-height: 42vh;
  }

  .grid-assignment-pane {
    max-height: 42vh;
  }

  .grid-assign-columns {
    display: none;
  }

  .grid-assign-row {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
}

@media (max-width: 860px) {
  .frame-row {
    flex-direction: column;
    align-items: stretch;
  }

  .frame-thumbs {
    width: 100%;
  }

  .frame-thumb {
    width: 100%;
  }

  .latest-grid-strip {
    grid-template-columns: 1fr;
  }

  .grid-history-list {
    grid-auto-columns: minmax(148px, 168px);
  }

  .latest-grid-strip-thumb {
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 9;
  }

  .latest-grid-strip-actions {
    justify-content: flex-start;
  }
}
</style>
