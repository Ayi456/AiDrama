<template>
  <div class="shot-frames">
    <div class="shot-frames__toolbar">
      <div class="shot-frames__toolbar-meta">
        <span class="dim shot-frames__meta">{{ sbs.length }} 个镜头</span>
        <span class="tag mono">{{ shotImgCount }}/{{ sbs.length }} 已有帧图</span>
        <span class="tag">{{ lockedImageConfigLabel }}</span>
        <span class="tag shot-frames__jump-tip">点击分镜信息可回到分镜编辑</span>
      </div>

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

    <div class="shot-frames__params">
      <div class="shot-frames__params-head">
        <div>
          <div class="shot-frames__params-kicker">生成参数</div>
          <div class="shot-frames__params-copy">当前仅作用于分镜首帧 / 尾帧的生成与重新生成</div>
        </div>
        <div class="shot-frames__params-tags">
          <span class="tag mono">{{ shotImageResolvedSize }}</span>
          <span v-if="lockedImageProvider" class="tag">{{ lockedImageProvider }}</span>
        </div>
      </div>

      <div class="shot-frames__params-grid">
        <div class="shot-frames__param-group">
          <div class="shot-frames__param-label">画面比例</div>
          <div class="shot-frames__param-pills">
            <button
              v-for="option in shotImageAspectRatioOptions"
              :key="option.value"
              type="button"
              :class="['shot-frames__pill', { active: shotImageAspectRatio === option.value }]"
              :aria-pressed="shotImageAspectRatio === option.value"
              @click="emit('change-shot-image-aspect-ratio', option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div class="shot-frames__param-group">
          <div class="shot-frames__param-label">输出尺寸</div>
          <div class="shot-frames__size-grid">
            <button
              v-for="option in shotImageSizePresetOptions"
              :key="option.value"
              type="button"
              :class="['shot-frames__size-pill', { active: shotImageSizePreset === option.value }]"
              :aria-pressed="shotImageSizePreset === option.value"
              @click="emit('change-shot-image-size-preset', option.value)"
            >
              <span class="shot-frames__size-main">{{ option.label }}</span>
              <span class="shot-frames__size-note">{{ option.note }}</span>
            </button>
          </div>
        </div>
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
          @click="openStoryboard(sb)"
        >
          <div class="frame-info">
            <div class="frame-top">
              <div class="frame-top-left">
                <span class="frame-num">#{{ String(i + 1).padStart(2, '0') }}</span>
                <span class="frame-badge">{{ sb.shot_type || sb.shotType || '—' }}</span>
              </div>

              <button class="frame-jump-btn" type="button" @click.stop="openStoryboard(sb)">
                分镜页
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
              </button>
            </div>

            <div class="frame-title-row">
              <div class="frame-title">{{ sb.title || `镜头 ${String(i + 1).padStart(2, '0')}` }}</div>
              <span class="frame-state-pill" :class="getShotStateClass(sb)">{{ getShotStateText(sb) }}</span>
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

          <div class="frame-thumbs" @click.stop>
            <div class="frame-thumb-wrap">
              <div class="frame-slot-head">
                <span class="frame-thumb-label">首帧</span>
                <span v-if="getFirstFrame(sb)" class="frame-slot-status">已出图</span>
              </div>

              <div class="frame-thumb" @click.stop="!getFirstFrame(sb) && !isPendingShotFrame(sb.id, 'first_frame') && emit('generate-shot-frame', { sb, frameType: 'first_frame' })">
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

              <div class="frame-thumb-actions">
                <button
                  class="btn btn-sm frame-thumb-action frame-thumb-action--primary"
                  type="button"
                  :disabled="isPendingShotFrame(sb.id, 'first_frame')"
                  @click.stop="emit('generate-shot-frame', { sb, frameType: 'first_frame' })"
                >
                  {{ getFrameActionLabel(sb, 'first_frame') }}
                </button>
                <button
                  v-if="getFirstFrame(sb)"
                  class="btn btn-sm frame-thumb-action"
                  type="button"
                  @click.stop="openViewer('/' + getFirstFrame(sb), `镜头 #${String(i + 1).padStart(2, '0')} 首帧`)"
                >
                  查看
                </button>
              </div>
            </div>

            <div v-if="frameMode === 'first_last'" class="frame-thumb-wrap">
              <div class="frame-slot-head">
                <span class="frame-thumb-label">尾帧</span>
                <span v-if="getLastFrame(sb)" class="frame-slot-status">已出图</span>
              </div>

              <div class="frame-thumb" @click.stop="!getLastFrame(sb) && !isPendingShotFrame(sb.id, 'last_frame') && emit('generate-shot-frame', { sb, frameType: 'last_frame' })">
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

              <div class="frame-thumb-actions">
                <button
                  class="btn btn-sm frame-thumb-action frame-thumb-action--primary"
                  type="button"
                  :disabled="isPendingShotFrame(sb.id, 'last_frame')"
                  @click.stop="emit('generate-shot-frame', { sb, frameType: 'last_frame' })"
                >
                  {{ getFrameActionLabel(sb, 'last_frame') }}
                </button>
                <button
                  v-if="getLastFrame(sb)"
                  class="btn btn-sm frame-thumb-action"
                  type="button"
                  @click.stop="openViewer('/' + getLastFrame(sb), `镜头 #${String(i + 1).padStart(2, '0')} 尾帧`)"
                >
                  查看
                </button>
              </div>
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

const props = defineProps({
  sbs: { type: Array, default: () => [] },
  shotImgCount: { type: Number, default: 0 },
  lockedImageConfigLabel: { type: String, default: '' },
  selectedSbId: { type: Number, default: 0 },
  frameMode: { type: String, default: 'first' },
  frameModeOptions: { type: Array, default: () => [] },
  shotImageAspectRatio: { type: String, default: '16:9' },
  shotImageAspectRatioOptions: { type: Array, default: () => [] },
  shotImageSizePreset: { type: String, default: '2K' },
  shotImageSizePresetOptions: { type: Array, default: () => [] },
  shotImageResolvedSize: { type: String, default: '2560x1440' },
  lockedImageProvider: { type: String, default: '' },
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
  'change-shot-image-aspect-ratio',
  'change-shot-image-size-preset',
  'open-grid-tool',
  'reopen-grid-preview',
  'continue-grid-split',
  'toggle-grid-history',
  'select-grid-history',
  'select-shot',
  'open-storyboard',
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

function openStoryboard(sb) {
  emit('select-shot', sb)
  emit('open-storyboard', sb)
}

function hasFrameByType(sb, frameType) {
  return frameType === 'last_frame' ? !!props.getLastFrame(sb) : !!props.getFirstFrame(sb)
}

function getFrameActionLabel(sb, frameType) {
  if (props.isPendingShotFrame(sb.id, frameType)) return '生成中'
  return hasFrameByType(sb, frameType) ? '重新生成' : '立即生成'
}

function getShotStateText(sb) {
  const firstReady = !!props.getFirstFrame(sb)
  const lastReady = !!props.getLastFrame(sb)
  const firstPending = props.isPendingShotFrame(sb.id, 'first_frame')
  const lastPending = props.isPendingShotFrame(sb.id, 'last_frame')

  if (firstPending || lastPending) return '生成中'
  if (props.frameMode === 'first_last') {
    if (firstReady && lastReady) return '首尾已齐'
    if (firstReady || lastReady) return '部分完成'
    return '待出图'
  }
  return firstReady ? '首帧已就绪' : '待出图'
}

function getShotStateClass(sb) {
  const text = getShotStateText(sb)
  if (text === '生成中') return 'is-pending'
  if (text === '待出图') return 'is-empty'
  if (text === '部分完成') return 'is-partial'
  return 'is-ready'
}
</script>

<style>
@import url('~/assets/production-shot-frames.css');
</style>
