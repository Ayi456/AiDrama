<template>
  <div class="content-panel">
    <div v-if="!state.scriptContent || !state.sbs.length" class="step-empty" style="flex:1">
      <div class="empty-visual">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
      </div>
      <div class="empty-title">尚未准备就绪</div>
      <div class="empty-desc">{{ !state.scriptContent ? '请先完成剧本编写' : '请先完成分镜拆解' }}</div>
      <button class="btn btn-primary" @click="handlers.goScript()">前往剧本</button>
    </div>

    <template v-else>
      <div class="step-toolbar prod-toolbar">
        <div class="toolbar-left">
          <div class="step-indicator">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            <span class="step-name">制作工作台</span>
          </div>
        </div>
        <div class="prod-tabs">
          <button
            v-for="tab in state.prodTabDefs"
            :key="tab.id"
            :class="['prod-tab', { active: state.prodTab === tab.id }]"
            @click="handlers.setProdTab(tab.id)"
          >
            <component :is="tab.icon" :size="11" />
            {{ tab.label }}
            <span v-if="tab.badge" class="prod-tab-badge">{{ tab.badge }}</span>
          </button>
        </div>
      </div>

      <ProductionCharacterGallery
        v-if="state.prodTab === 'chars'"
        class="prod-content"
        :characters="state.visualChars"
        :locked-image-config-label="state.lockedImageConfigLabel"
        :pending-character-image-ids="state.pendingCharImageIds"
        :replacing-character-image-ids="state.replacingCharacterImageIds"
        :has-narrator-only="state.chars.length > state.visualChars.length"
        @batch-generate="handlers.batchCharImages"
        @generate="handlers.genCharImg"
        @replace-image="handlers.replaceCharImage"
        @update-character-description="handlers.handleCharacterDescriptionUpdate"
        @open-image-viewer="handlers.handleGalleryViewerOpen"
      />

      <ProductionSceneGallery
        v-else-if="state.prodTab === 'scenes'"
        class="prod-content"
        :scenes="state.scenes"
        :locked-image-config-label="state.lockedImageConfigLabel"
        :pending-scene-image-ids="state.pendingSceneImageIds"
        :replacing-scene-image-ids="state.replacingSceneImageIds"
        @batch-generate="handlers.batchSceneImages"
        @generate="handlers.genSceneImg"
        @replace-image="handlers.replaceSceneImage"
        @update-scene-field="handlers.handleSceneFieldUpdate"
        @open-image-viewer="handlers.handleGalleryViewerOpen"
      />

      <ProductionShotFrames
        v-else-if="state.prodTab === 'shots'"
        class="prod-content"
        :sbs="state.sbs"
        :shot-img-count="state.shotImgCount"
        :locked-image-config-label="state.lockedImageConfigLabel"
        :locked-image-model-name="state.lockedImageModelName"
        :locked-image-provider="state.lockedImageProvider"
        :selected-sb-id="state.selectedSbId"
        :reference-options="state.referenceOptions"
        :shot-image-history="state.shotImageHistory"
        :frame-mode="state.frameMode"
        :frame-mode-options="state.frameModeOptions"
        :shot-image-aspect-ratio="state.shotImageAspectRatio"
        :shot-image-aspect-ratio-options="state.shotImageAspectRatioOptions"
        :shot-image-size-preset="state.shotImageSizePreset"
        :shot-image-size-preset-options="state.shotImageSizePresetOptions"
        :shot-image-resolved-size="state.shotImageResolvedSize"
        :grid-image-path="state.gridImagePath"
        :grid-actual-layout="state.gridActualLayout"
        :grid-recovered-mode="state.gridRecoveredMode"
        :grid-recovered-at="state.gridRecoveredAt"
        :show-all-grid-history="state.showAllGridHistory"
        :grid-history="state.gridHistory"
        :grid-dialog="state.gridDialog"
        :grid-step="state.gridStep"
        :grid-modes="state.gridModes"
        :grid-mode="state.gridMode"
        :grid-layout="state.gridLayout"
        :grid-layout-options="state.gridLayoutOptions"
        :grid-selected="state.gridSelected"
        :grid-single-target="state.gridSingleTarget"
        :grid-can-start="state.gridCanStart"
        :grid-auto-layout="state.gridAutoLayout"
        :grid-prompt-loading="state.gridPromptLoading"
        :grid-prompt-status="state.gridPromptStatus"
        :grid-summary="state.gridSummary"
        :grid-prompt-source="state.gridPromptSource"
        :grid-prompt-text="state.gridPromptText"
        :grid-cell-prompts="state.gridCellPrompts"
        :grid-blank-style="state.gridBlankStyle"
        :grid-status-text="state.gridStatusText"
        :grid-overlay-style="state.gridOverlayStyle"
        :grid-assignments="state.gridAssignments"
        :active-grid-cell="state.activeGridCell"
        :grid-assigned-count="state.gridAssignedCount"
        :grid-assignment-total-pages="state.gridAssignmentTotalPages"
        :grid-assignment-page="state.gridAssignmentPage"
        :grid-assignment-page-start="state.gridAssignmentPageStart"
        :grid-assignment-page-end="state.gridAssignmentPageEnd"
        :paged-grid-assignments="state.pagedGridAssignments"
        :grid-assignment-shot-options="state.gridAssignmentShotOptions"
        :grid-frame-type-options="state.gridFrameTypeOptions"
        :get-first-frame="state.getFirstFrame"
        :get-last-frame="state.getLastFrame"
        :get-shot-reference-images="state.getShotReferenceImages"
        :get-shot-manual-reference-images="state.getShotManualReferenceImages"
        :is-pending-shot-frame="state.isPendingShotFrame"
        :grid-cell-label="state.gridCellLabel"
        :grid-cell-title="state.gridCellTitle"
        @change-frame-mode="handlers.handleFrameModeChange"
        @change-shot-image-aspect-ratio="handlers.handleShotImageAspectRatioChange"
        @change-shot-image-size-preset="handlers.handleShotImageSizePresetChange"
        @open-grid-tool="handlers.openGridTool"
        @reopen-grid-preview="handlers.reopenGridPreview"
        @continue-grid-split="handlers.continueGridSplit"
        @toggle-grid-history="handlers.handleGridHistoryToggle"
        @select-grid-history="handlers.selectGridHistory"
        @select-shot="handlers.handleShotSelection"
        @open-storyboard="handlers.handleStoryboardOpen"
        @update-shot-field="handlers.handleShotFieldUpdate"
        @generate-shot-frame="handlers.handleShotFrameGenerate"
        @restore-shot-frame="handlers.handleShotFrameRestore"
        @open-image-viewer="handlers.handleGalleryViewerOpen"
        @close-grid-dialog="handlers.setGridDialog(false)"
        @change-grid-mode="handlers.handleGridModeChange"
        @change-grid-layout="handlers.setGridLayout($event)"
        @toggle-grid-select-all="handlers.gridSelectAll"
        @toggle-grid-shot="handlers.handleGridShotToggle"
        @change-grid-single-target="handlers.setGridSingleTarget($event)"
        @generate-grid-prompt="handlers.generateGridPrompt"
        @start-grid-generation="handlers.startGridGen"
        @change-grid-step="handlers.setGridStep($event)"
        @focus-grid-cell="handlers.focusGridCell"
        @change-grid-assignment-page="handlers.handleGridAssignmentPageChange"
        @update-grid-assignment="handlers.handleGridAssignmentUpdate"
        @do-grid-split="handlers.doGridSplit"
        @finish-grid-dialog="handlers.handleGridDialogFinish"
      />

      <ChapterProductionVideos v-else-if="state.prodTab === 'videos'" :state="state" :handlers="handlers" />
    </template>
  </div>
</template>

<script setup>
import ChapterProductionVideos from '@/components/chapter/ChapterProductionVideos.vue'
import ProductionCharacterGallery from '@/components/chapter/ProductionCharacterGallery.vue'
import ProductionSceneGallery from '@/components/chapter/ProductionSceneGallery.vue'
import ProductionShotFrames from '@/components/chapter/ProductionShotFrames.vue'

defineProps({
  state: {
    type: Object,
    required: true,
  },
  handlers: {
    type: Object,
    required: true,
  },
})
</script>
