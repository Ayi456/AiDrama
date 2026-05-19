<template>
  <div class="studio">
    <div v-if="loading" class="route-state route-state-full">
      <Loader2 :size="24" class="animate-spin" />
      <div class="route-state-title">正在加载章节工作台</div>
      <div class="route-state-desc">正在读取项目、章节和分镜数据...</div>
    </div>

    <div v-else-if="loadError" class="route-state route-state-full route-state-error">
      <div class="route-state-title">章节加载失败</div>
      <div class="route-state-desc">{{ loadError }}</div>
      <div class="route-state-actions">
        <button class="btn" @click="router.push(`/drama/${dramaId}`)">返回剧集</button>
        <button class="btn btn-primary" @click="refresh">重试</button>
      </div>
    </div>

    <template v-else-if="drama">
    <ChapterStudioTopbar
      :drama-title="drama.title"
      :chapter-number="chapterNumber"
      :current-sub-stage-label="currentSubStageLabel"
      :pipeline-progress="pipelineProgress"
      :character-count="chars.length"
      :shot-count="sbs.length"
      :has-merge-output="!!mergeUrl"
      @back="goDramaDetail"
      @refresh="refresh"
      @primary-action="panel = mergeUrl ? 'export' : (sbs.length ? 'production' : 'script')"
    />

    <div class="studio-body">
    <!-- ========== LEFT SIDEBAR ========== -->
    <ChapterStudioSidebar
      :sidebar-sections="sidebarSections"
      :active-sub-step-key="activeSubStepKey"
      :pipeline-progress="pipelineProgress"
      :sidebar-jump-steps="sidebarJumpSteps"
      @go-sub-step="goSubStep"
      @refresh="refresh"
    />

    <!-- ========== MAIN CONTENT ========== -->
    <main class="main">
      <ChapterStudioSubnav
        :active-sub-steps="activeSubSteps"
        :active-sub-step-key="activeSubStepKey"
        @go-sub-step="goSubStep"
      />

      <!-- ===== SCRIPT PANEL ===== -->
      <div v-if="panel === 'script'" class="content-panel">
        <ChapterScriptSteps
          v-if="scriptStep < 3"
          :script-step="scriptStep"
          :raw-len="rawLen"
          :script-len="scriptLen"
          :local-raw="localRaw"
          :local-script="localScript"
          :raw-content="rawContent"
          :script-content="scriptContent"
          :rn="rn"
          :rt="rt"
          :chars="chars"
          :scenes="scenes"
          :merge-char-desc="mergeCharDesc"
          @update:local-raw="localRaw = $event"
          @update:local-script="localScript = $event"
          @save-raw="saveRaw"
          @skip-rewrite="skipRewrite"
          @rewrite="doRewrite"
          @extract="doExtract"
        />
        <ChapterStoryboardEditor
          v-else
          :rn="rn"
          :rt="rt"
          :sbs="sbs"
          :total-duration="totalDuration"
          :locked-video-config-label="lockedVideoConfigLabel"
          :selected-sb="selectedSb"
          :chars="chars"
          :scenes="scenes"
          :shot-types="shotTypes"
          :shot-angles="shotAngles"
          :shot-movements="shotMovements"
          :get-storyboard-character-ids="getStoryboardCharacterIds"
          :get-storyboard-character-names="getStoryboardCharacterNames"
          :get-storyboard-state-class="getStoryboardStateClass"
          :get-storyboard-state-text="getStoryboardStateText"
          :get-scene-name="getSceneName"
          :get-first-frame="getFirstFrame"
          :get-last-frame="getLastFrame"
          :has-vid="hasVid"
          @add-shot="addShot"
          @breakdown="doBreakdown"
          @select-shot="handleShotSelection"
          @delete-shot="deleteShot"
          @toggle-storyboard-character="toggleStoryboardCharacter($event.sb, $event.charId)"
          @update-shot-field="handleShotFieldUpdate"
          @open-image-viewer="handleGalleryViewerOpen"
        />
      </div>

      <!-- ===== PRODUCTION PANEL ===== -->
      <ChapterProductionPanel
        v-else-if="panel === 'production'"
        :state="productionPanelState"
        :handlers="productionPanelHandlers"
      />

      <!-- ===== EXPORT PANEL ===== -->
      <ChapterExportPanel
        v-else
        :sbs="sbs"
        :merge-url="mergeUrl"
        :clip-count="mergeClipCount"
        :total-duration="totalDuration"
        :has-clip="hasMergeClip"
        :selected-storyboard-ids="selectedMergeStoryboardIds"
        :is-merging="mergeBusy"
        @go-script="panel = 'script'"
        @update:selected-storyboard-ids="handleMergeSelectionUpdate"
        @merge="handleMergeSelected"
      />

      <ChapterBottomBubble
        :show="showBottomBubble"
        :panel="panel"
        :script-step="scriptStep"
        :prod-tab="prodTab"
        :prod-tab-idx="prodTabIdx"
        :prod-tab-defs="prodTabDefs"
        :bubble-steps="bubbleSteps"
        :active-bubble-key="activeBubbleKey"
        :can-go-next="canGoNext"
        :can-export="canExport"
        :prev-step-label="prevStepLabel"
        :next-step-label="nextStepLabel"
        @go-sub-step="goSubStep"
        @go-prev-step="goPrevStep"
        @go-next-step="goNextStep"
        @go-prev-prod="goPrevProd"
        @go-next-prod="goNextProd"
      />

      <ChapterImageViewer :image-viewer="imageViewer" @close="closeImageViewer" />

    </main>
    </div>
    </template>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import { Loader2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { chapterAPI, dramaAPI, characterAPI, sceneAPI, mergeAPI, characterAssetAPI, uploadAPI } from '@/composables/useApi'
import { useAgent } from '@/composables/useAgent'
import { useConfirm } from '@/composables/useConfirm'
import ChapterBottomBubble from '@/components/chapter/ChapterBottomBubble.vue'
import ChapterExportPanel from '@/components/chapter/ChapterExportPanel.vue'
import ChapterImageViewer from '@/components/chapter/ChapterImageViewer.vue'
import ChapterProductionPanel from '@/components/chapter/ChapterProductionPanel.vue'
import ChapterScriptSteps from '@/components/chapter/ChapterScriptSteps.vue'
import ChapterStudioSidebar from '@/components/chapter/ChapterStudioSidebar.vue'
import ChapterStudioSubnav from '@/components/chapter/ChapterStudioSubnav.vue'
import ChapterStudioTopbar from '@/components/chapter/ChapterStudioTopbar.vue'
import ChapterStoryboardEditor from '@/components/chapter/ChapterStoryboardEditor.vue'
import { useChapterExportDesk } from '@/composables/chapter/useChapterExportDesk'
import { useChapterGridTool } from '@/composables/chapter/useChapterGridTool'
import { useChapterImageViewer } from '@/composables/chapter/useChapterImageViewer'
import { useChapterMediaPipeline } from '@/composables/chapter/useChapterMediaPipeline'
import { useChapterProductionPanelBridge } from '@/composables/chapter/useChapterProductionPanelBridge'
import { useChapterScriptDesk } from '@/composables/chapter/useChapterScriptDesk'
import { useChapterShotImagePreferences } from '@/composables/chapter/useChapterShotImagePreferences'
import { useChapterStoryboardDesk } from '@/composables/chapter/useChapterStoryboardDesk'
import { useChapterStudioConfig } from '@/composables/chapter/useChapterStudioConfig'
import { useChapterStudioNavigation } from '@/composables/chapter/useChapterStudioNavigation'
import { assetUrl } from '@/utils/asset-url'

const route = useRoute()
const router = useRouter()
const { confirm } = useConfirm()
const dramaId = Number(route.params.id)
const chapterNumber = Number(route.params.chapterNumber || route.params.episodeNumber)

const drama = ref(null)
const episode = ref(null)
const loading = ref(true)
const loadError = ref('')
const chars = ref([])
const scenes = ref([])
const sbs = ref([])
const mergeData = ref(null)
const selectedSb = ref(null)
const characterAssets = ref([])
const characterAssetBusy = ref(false)

const { running: rn, runningType: rt, run: runAgent } = useAgent()
const scriptStep = ref(0)

const {
  imageConfigs,
  videoConfigs,
  lockedImageConfigId,
  lockedVideoConfigId,
  lockedImageProvider,
  lockedVideoProvider,
  lockedImageConfigLabel,
  lockedImageModelName,
  lockedVideoConfigLabel,
  lockedVideoModelName,
  loadConfigs,
} = useChapterStudioConfig({
  drama,
  episode,
})

const epId = computed(() => episode.value?.id || 0)

const {
  localRaw,
  localScript,
  rawContent,
  scriptContent,
  rawLen,
  scriptLen,
  saveRaw,
  saveScr,
  doRewrite,
  skipRewrite,
  doExtract,
  doBreakdown,
} = useChapterScriptDesk({
  dramaId,
  epId,
  episode,
  scriptStep,
  videoConfigs,
  lockedVideoConfigId,
  runAgent,
  refresh,
  notifySuccess: toast.success,
  notifyWarning: toast.warning,
})

const gridLayoutOptions = [
  { label: '2x2', value: '2x2' },
  { label: '3x3', value: '3x3' },
  { label: '4x4', value: '4x4' },
  { label: '5x5', value: '5x5' },
]

const {
  frameMode,
  frameModeOptions,
  shotImageAspectRatio,
  shotImageAspectRatioOptions,
  shotImageSizePreset,
  shotImageSizePresetOptions,
  shotImageResolvedSize,
  visualChars,
  shotReferenceOptions,
  restoreShotImagePreferences,
  handleFrameModeChange,
  handleShotImageAspectRatioChange,
  handleShotImageSizePresetChange,
} = useChapterShotImagePreferences({
  dramaId,
  chapterNumber,
  epId,
  chars,
  scenes,
})

const {
  updateField,
  getStoryboardCharacterIds,
  getStoryboardCharacterNames,
  isStoryboardCharacterSelected,
  toggleStoryboardCharacter,
  getSceneName,
  addShot,
  deleteShot,
  handleShotSelection,
  handleStoryboardOpen,
  handleShotFieldUpdate,
} = useChapterStoryboardDesk({
  epId,
  sbs,
  chars,
  scenes,
  selectedSb,
  confirm,
  refresh,
  goSubStep: key => goSubStep(key),
})

function mergeCharDesc(char) {
  return [char.description, char.appearance, char.personality].filter(Boolean).join('\n')
}

const characterDescriptionSavePromises = new Map()

async function saveCharImagePrompt(char, value) {
  const next = String(value || '')
  const old = char.image_prompt || char.imagePrompt || ''
  const key = Number(char?.id || 0)
  if (old === next) return key ? characterDescriptionSavePromises.get(key) : undefined
  char.image_prompt = next
  char.imagePrompt = next
  const savePromise = characterAPI
    .update(char.id, { image_prompt: next })
    .finally(() => {
      if (key && characterDescriptionSavePromises.get(key) === savePromise) {
        characterDescriptionSavePromises.delete(key)
      }
    })
  if (key) characterDescriptionSavePromises.set(key, savePromise)
  await savePromise
}

function updateSceneField(scene, field, value) {
  const current = scene[field] ?? ''
  if (current === value) return
  scene[field] = value
  sceneAPI.update(scene.id, { [field]: value })
}

async function handleCharacterDescriptionUpdate(payload) {
  if (!payload?.character) return
  try {
    await saveCharImagePrompt(payload.character, payload.value || '')
  } catch (error) {
    toast.error(error?.message || '角色描述词保存失败')
  }
}

async function handleCharacterGenerate(payload) {
  const character = typeof payload === 'object'
    ? payload.character
    : chars.value.find(item => item.id === payload)
  const id = Number(typeof payload === 'object' ? (payload.id || character?.id || 0) : payload)
  if (!id) return
  try {
    if (character && typeof payload === 'object' && 'value' in payload) {
      await saveCharImagePrompt(character, payload.value || '')
    }
    await genCharImg(id)
  } catch (error) {
    toast.error(error?.message || '角色图片生成失败')
  }
}

async function loadCharacterAssets() {
  try {
    characterAssets.value = await characterAssetAPI.list()
  } catch (error) {
    toast.error(error?.message || '角色形象库加载失败')
  }
}

function assetNameFromFile(file) {
  return String(file?.name || '角色形象').replace(/\.[^.]+$/, '').trim() || '角色形象'
}

async function handleCharacterAssetUpload(payload) {
  if (!payload?.file) return
  characterAssetBusy.value = true
  try {
    const uploaded = await uploadAPI.image(payload.file)
    await characterAssetAPI.create({
      name: assetNameFromFile(payload.file),
      gender: payload.gender || 'unknown',
      role_preset: payload.rolePreset || 'custom',
      image_url: uploaded.url,
      local_path: uploaded.path,
      tags: payload.rolePreset ? [payload.rolePreset] : [],
      is_default: Boolean(payload.isDefault),
    })
    await loadCharacterAssets()
    toast.success('角色形象已加入形象库')
  } catch (error) {
    toast.error(error?.message || '角色形象上传失败')
  } finally {
    characterAssetBusy.value = false
  }
}

async function handleCharacterAssetBind(payload) {
  if (!payload?.character?.id) return
  characterAssetBusy.value = true
  try {
    const assetId = Number(payload.assetId || 0)
    if (assetId) await characterAPI.bindAsset(payload.character.id, assetId)
    else await characterAPI.unbindAsset(payload.character.id)
    await refresh()
    toast.success(assetId ? '角色已绑定形象' : '角色已取消形象绑定')
  } catch (error) {
    toast.error(error?.message || '角色形象绑定失败')
  } finally {
    characterAssetBusy.value = false
  }
}

function handleSceneFieldUpdate(payload) {
  if (!payload?.scene || !payload?.field) return
  updateSceneField(payload.scene, payload.field, payload.value)
}

async function refresh() {
  const showBlockingState = !drama.value
  if (showBlockingState) loading.value = true
  loadError.value = ''
  try {
    drama.value = await dramaAPI.get(dramaId)
    const currentEpisode = drama.value.episodes?.find(item => (item.episode_number || item.episodeNumber) === chapterNumber)
    if (!currentEpisode) {
      episode.value = null
      chars.value = []
      scenes.value = []
      sbs.value = []
      selectedSb.value = null
      loadError.value = `未找到第 ${chapterNumber || '-'} 集`
      return
    }

    episode.value = currentEpisode
    try { chars.value = await chapterAPI.characters(currentEpisode.id) } catch { chars.value = [] }
    try { scenes.value = await chapterAPI.scenes(currentEpisode.id) } catch { scenes.value = [] }
    sbs.value = await chapterAPI.storyboards(currentEpisode.id)
    await loadCharacterAssets()

    if (!sbs.value.length) selectedSb.value = null
    else if (!selectedSb.value || !sbs.value.some(sb => sb.id === selectedSb.value.id)) selectedSb.value = sbs.value[0]

    syncScriptStep()
    await loadLatestGridImage()
  } catch (error) {
    loadError.value = error?.message || '章节数据加载失败'
    toast.error(loadError.value)
  } finally {
    if (showBlockingState) loading.value = false
  }

  if (!epId.value) return
  try {
    mergeData.value = await mergeAPI.status(epId.value)
  } catch {}
}

const { imageViewer, openImageViewer, closeImageViewer, handleGalleryViewerOpen } = useChapterImageViewer()

const {
  pendingCharImageIds,
  pendingSceneImageIds,
  replacingCharacterImageIds,
  replacingSceneImageIds,
  pendingVideoIds,
  isMerging,
  shotImageHistory,
  isPendingCharImage,
  isPendingSceneImage,
  isPendingShotFrame,
  isPendingVideo,
  videoFailMessage,
  getVideoHistory,
  isVideoHistoryLoading,
  loadVideoHistory,
  restoreVideoFromHistory,
  videoHistoryUrl,
  getStoryboardStateText,
  getStoryboardStateClass,
  getVideoGenerateActionLabel,
  getVideoStateText,
  getVideoStateClass,
  getVideoReferenceSummary,
  buildDefaultVideoPrompt,
  activeVideoSb,
  activeVideoShotIndexLabel,
  getFirstFrame,
  getLastFrame,
  getStoryboardCover,
  getVideoUrl,
  hasImg,
  hasVid,
  getRefs,
  getShotReferenceImages,
  getShotManualReferenceImages,
  genCharImg,
  replaceCharImage,
  batchCharImages,
  genSceneImg,
  replaceSceneImage,
  batchSceneImages,
  genVid,
  batchVideos,
  doMerge,
  stopMergePolling,
  handleShotFrameGenerate,
  handleShotFrameRestore,
} = useChapterMediaPipeline({
  dramaId,
  epId,
  chars,
  scenes,
  sbs,
  visualChars,
  selectedSb,
  mergeData,
  refresh,
  lockedImageConfigId,
  lockedVideoConfigId,
  shotImageResolvedSize,
  shotImageAspectRatio,
  updateField,
  getStoryboardCharacterIds,
  getStoryboardCharacterNames,
  getSceneName,
})

const {
  selectedMergeStoryboardIds,
  hasMergeClip,
  mergeClipCount,
  mergeUrl,
  mergeBusy,
  handleMergeSelectionUpdate,
  handleMergeSelected,
} = useChapterExportDesk({
  sbs,
  mergeData,
  isMerging,
  doMerge,
})

function goDramaDetail() {
  stopMergePolling()
  router.replace({ name: 'drama-detail', params: { id: String(dramaId) } })
}

const {
  gridDialog,
  gridStep,
  gridLayout,
  gridMode,
  gridSelected,
  gridSingleTarget,
  gridImagePath,
  gridStatusText,
  gridActualLayout,
  gridRecoveredAt,
  gridRecoveredMode,
  gridPromptText,
  gridCellPrompts,
  gridPromptSource,
  gridPromptLoading,
  gridPromptStatus,
  gridHistory,
  showAllGridHistory,
  activeGridCell,
  gridAssignmentPage,
  gridModes,
  gridCanStart,
  gridSummary,
  gridAssignments,
  gridAssignmentShotOptions,
  gridFrameTypeOptions,
  gridAssignedCount,
  gridAssignmentTotalPages,
  gridAssignmentPageStart,
  gridAssignmentPageEnd,
  pagedGridAssignments,
  gridOverlayStyle,
  gridAutoLayout,
  gridBlankStyle,
  gridCellLabel,
  gridCellTitle,
  focusGridCell,
  handleGridHistoryToggle,
  handleGridModeChange,
  handleGridShotToggle,
  handleGridAssignmentPageChange,
  handleGridAssignmentUpdate,
  handleGridDialogFinish,
  gridSelectAll,
  openGridTool,
  selectGridHistory,
  reopenGridPreview,
  continueGridSplit,
  generateGridPrompt,
  startGridGen,
  loadLatestGridImage,
  doGridSplit,
} = useChapterGridTool({
  dramaId,
  chapterNumber,
  epId,
  sbs,
  refresh,
})

const {
  panel,
  prodTab,
  prodTabIdx,
  prodTabDefs,
  sidebarSections,
  activeSubSteps,
  activeSubStepKey,
  sidebarJumpSteps,
  bubbleSteps,
  activeBubbleKey,
  showBottomBubble,
  goSubStep,
  shotImgCount,
  shotVidCount,
  canExport,
  goNextProd,
  prevStepLabel,
  nextStepLabel,
  canGoNext,
  goPrevStep,
  goNextStep,
  syncScriptStep,
  pipelineProgress,
  currentSubStageLabel,
} = useChapterStudioNavigation({
  scriptStep,
  rawContent,
  scriptContent,
  localRaw,
  localScript,
  chars,
  scenes,
  sbs,
  visualChars,
  mergeClipCount,
  mergeUrl,
  saveRaw,
  saveScr,
})

const totalDuration = computed(() => sbs.value.reduce((sum, sb) => sum + (sb.duration || 10), 0))
const shotTypes = [
  '大远景', '远景', '全景', '中景', '中近景', '近景', '特写', '大特写',
  '双人镜头', '三人镜头', '群像', '背影', '侧面', '正面', '俯视', '仰视',
  '过肩', '主观视角', '航拍', '运动镜头',
]
const shotAngles = ['平视', '仰视', '俯视', '侧拍', '背拍', '斜侧', '主观视角', '过肩']
const shotMovements = ['固定', '推镜', '拉镜', '摇镜', '移镜', '跟拍', '升降', '手持', '环绕']

function goPrevProd() {
  prodTabIdx.value = Math.max(0, prodTabIdx.value - 1)
}

const {
  productionPanelState,
  productionPanelHandlers,
} = useChapterProductionPanelBridge({
  panel,
  scriptContent,
  sbs,
  prodTab,
  prodTabDefs,
  visualChars,
  characterAssets,
  characterAssetBusy,
  chars,
  scenes,
  lockedImageConfigLabel,
  pendingCharImageIds,
  pendingSceneImageIds,
  replacingCharacterImageIds,
  replacingSceneImageIds,
  shotImgCount,
  lockedImageModelName,
  lockedImageProvider,
  selectedSb,
  shotReferenceOptions,
  shotImageHistory,
  frameMode,
  frameModeOptions,
  shotImageAspectRatio,
  shotImageAspectRatioOptions,
  shotImageSizePreset,
  shotImageSizePresetOptions,
  shotImageResolvedSize,
  gridImagePath,
  gridActualLayout,
  gridRecoveredMode,
  gridRecoveredAt,
  showAllGridHistory,
  gridHistory,
  gridDialog,
  gridStep,
  gridModes,
  gridMode,
  gridLayout,
  gridLayoutOptions,
  gridSelected,
  gridSingleTarget,
  gridCanStart,
  gridAutoLayout,
  gridPromptLoading,
  gridPromptStatus,
  gridSummary,
  gridPromptSource,
  gridPromptText,
  gridCellPrompts,
  gridBlankStyle,
  gridStatusText,
  gridOverlayStyle,
  gridAssignments,
  activeGridCell,
  gridAssignedCount,
  gridAssignmentTotalPages,
  gridAssignmentPage,
  gridAssignmentPageStart,
  gridAssignmentPageEnd,
  pagedGridAssignments,
  gridAssignmentShotOptions,
  gridFrameTypeOptions,
  lockedVideoConfigLabel,
  shotVidCount,
  lockedVideoProvider,
  lockedVideoModelName,
  activeVideoSb,
  activeVideoShotIndexLabel,
  videoFailMessage,
  getFirstFrame,
  getLastFrame,
  getRefs,
  getShotReferenceImages,
  getShotManualReferenceImages,
  isPendingShotFrame,
  gridCellLabel,
  gridCellTitle,
  hasVid,
  getVideoUrl,
  hasImg,
  getStoryboardCover,
  getVideoStateClass,
  getVideoStateText,
  getVideoReferenceSummary,
  isPendingVideo,
  getVideoHistory,
  isVideoHistoryLoading,
  loadVideoHistory,
  videoHistoryUrl,
  getVideoGenerateActionLabel,
  buildDefaultVideoPrompt,
  batchCharImages,
  genCharImg: handleCharacterGenerate,
  replaceCharImage,
  handleCharacterDescriptionUpdate,
  handleCharacterAssetUpload,
  handleCharacterAssetBind,
  handleGalleryViewerOpen,
  batchSceneImages,
  genSceneImg,
  replaceSceneImage,
  handleSceneFieldUpdate,
  handleFrameModeChange,
  handleShotImageAspectRatioChange,
  handleShotImageSizePresetChange,
  openGridTool,
  reopenGridPreview,
  continueGridSplit,
  handleGridHistoryToggle,
  selectGridHistory,
  handleShotSelection,
  handleStoryboardOpen,
  handleShotFieldUpdate,
  handleShotFrameGenerate,
  handleShotFrameRestore,
  handleGridModeChange,
  gridSelectAll,
  handleGridShotToggle,
  generateGridPrompt,
  startGridGen,
  focusGridCell,
  handleGridAssignmentPageChange,
  handleGridAssignmentUpdate,
  doGridSplit,
  handleGridDialogFinish,
  batchVideos,
  genVid,
  restoreVideoFromHistory,
  openImageViewer,
  resolveAssetUrl: assetUrl,
})

onMounted(() => {
  restoreShotImagePreferences()
  refresh()
  loadConfigs()
})
</script>


<style>
@import url('@/assets/episode-studio.css');
</style>
