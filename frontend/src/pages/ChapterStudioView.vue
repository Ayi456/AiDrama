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
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { chapterAPI, dramaAPI, storyboardAPI, characterAPI, sceneAPI, mergeAPI, characterAssetAPI, uploadAPI } from '@/composables/useApi'
import { useAgent } from '@/composables/useAgent'
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
import { useChapterStudioConfig } from '@/composables/chapter/useChapterStudioConfig'
import { useChapterStudioNavigation } from '@/composables/chapter/useChapterStudioNavigation'
import { assetUrl } from '@/utils/asset-url'
import {
  SHOT_IMAGE_ASPECT_RATIO_OPTIONS,
  SHOT_IMAGE_SIZE_PRESET_OPTIONS,
  isShotImageAspectRatio,
  isShotImageSizePreset,
  resolveShotImageSize,
} from '@/utils/shot-image-size'

const route = useRoute()
const router = useRouter()
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

const localRaw = ref('')
const localScript = ref('')
const frameMode = ref('first')
const shotImageAspectRatio = ref('16:9')
const shotImageSizePreset = ref('2K')

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

const rawContent = computed(() => episode.value?.content || '')
const scriptContent = computed(() => episode.value?.script_content || episode.value?.scriptContent || '')
const epId = computed(() => episode.value?.id || 0)
const rawLen = computed(() => localRaw.value.replace(/\s/g, '').length || 0)
const scriptLen = computed(() => localScript.value.replace(/\s/g, '').length || 0)

const frameModeOptions = [
  { label: '仅首帧', value: 'first' },
  { label: '首尾帧', value: 'first_last' },
]
const shotImageAspectRatioOptions = SHOT_IMAGE_ASPECT_RATIO_OPTIONS.map(option => ({ ...option }))
const shotImageSizePresetOptions = SHOT_IMAGE_SIZE_PRESET_OPTIONS.map(option => ({ ...option }))
const gridLayoutOptions = [
  { label: '2x2', value: '2x2' },
  { label: '3x3', value: '3x3' },
  { label: '4x4', value: '4x4' },
  { label: '5x5', value: '5x5' },
]

const shotImageResolvedSize = computed(() => resolveShotImageSize(shotImageAspectRatio.value, shotImageSizePreset.value))
const shotImagePrefsKey = computed(() => `aidrama:shot-image-prefs:${dramaId}:${epId.value || chapterNumber}`)

function restoreShotImagePreferences() {
  if (!import.meta.client) return
  try {
    const raw = localStorage.getItem(shotImagePrefsKey.value)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (isShotImageAspectRatio(parsed?.aspectRatio)) shotImageAspectRatio.value = parsed.aspectRatio
    if (isShotImageSizePreset(parsed?.sizePreset)) shotImageSizePreset.value = parsed.sizePreset
  } catch {}
}

function handleShotImageAspectRatioChange(value) {
  if (!isShotImageAspectRatio(value)) return
  shotImageAspectRatio.value = value
}

function handleShotImageSizePresetChange(value) {
  if (!isShotImageSizePreset(value)) return
  shotImageSizePreset.value = value
}

function isNarratorCharacter(char) {
  const text = `${char?.name || ''} ${char?.role || ''}`.toLowerCase()
  return text.includes('旁白') || text.includes('narrator') || text.includes('画外音')
}

const visualChars = computed(() => chars.value.filter(char => !isNarratorCharacter(char)))
const shotReferenceOptions = computed(() => {
  const options = []
  chars.value.forEach((char) => {
    const assetSrc = char.character_asset_image_url || char.characterAssetImageUrl
    if (assetSrc) options.push({ key: `character-asset-${char.id}`, type: 'character', src: assetSrc, label: `${char.name || `角色 ${char.id}`} 形象` })
    const src = char.image_url || char.imageUrl
    if (src) options.push({ key: `character-${char.id}`, type: 'character', src, label: char.name || `角色 ${char.id}` })
  })
  scenes.value.forEach((scene) => {
    const src = scene.image_url || scene.imageUrl
    if (src) options.push({ key: `scene-${scene.id}`, type: 'scene', src, label: scene.name || scene.location || `场景 ${scene.id}` })
  })
  return options
})

watch([shotImageAspectRatio, shotImageSizePreset, shotImagePrefsKey], () => {
  if (!import.meta.client) return
  try {
    localStorage.setItem(shotImagePrefsKey.value, JSON.stringify({
      aspectRatio: shotImageAspectRatio.value,
      sizePreset: shotImageSizePreset.value,
    }))
  } catch {}
})

watch(rawContent, value => { localRaw.value = value }, { immediate: true })
watch(scriptContent, value => { localScript.value = value }, { immediate: true })

function toCamel(field) {
  return field.replace(/_([a-z])/g, (_, char) => char.toUpperCase())
}

function updateField(sb, field, value) {
  const current = sb[field] ?? sb[toCamel(field)]
  if (current === value) return
  sb[field] = value
  const camelField = toCamel(field)
  if (camelField !== field) sb[camelField] = value
  storyboardAPI.update(sb.id, { [field]: value })
}

function mergeCharDesc(char) {
  return [char.description, char.appearance, char.personality].filter(Boolean).join('\n')
}

function saveMergedCharDesc(char, value) {
  const old = mergeCharDesc(char)
  if (old === value) return
  char.description = value
  char.appearance = ''
  char.personality = ''
  characterAPI.update(char.id, { description: value, appearance: '', personality: '' })
}

function updateSceneField(scene, field, value) {
  const current = scene[field] ?? ''
  if (current === value) return
  scene[field] = value
  sceneAPI.update(scene.id, { [field]: value })
}

function handleCharacterDescriptionUpdate(payload) {
  if (!payload?.character) return
  saveMergedCharDesc(payload.character, payload.value || '')
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

async function handleCharacterAssetDefault(asset) {
  if (!asset?.id) return
  characterAssetBusy.value = true
  try {
    await characterAssetAPI.setDefault(asset.id)
    await loadCharacterAssets()
    toast.success('默认角色形象已更新')
  } catch (error) {
    toast.error(error?.message || '默认形象设置失败')
  } finally {
    characterAssetBusy.value = false
  }
}

function handleSceneFieldUpdate(payload) {
  if (!payload?.scene || !payload?.field) return
  updateSceneField(payload.scene, payload.field, payload.value)
}

function getStoryboardCharacterIds(sb) {
  return sb?.character_ids || sb?.characterIds || []
}

function getStoryboardCharacterNames(sb) {
  const ids = getStoryboardCharacterIds(sb)
  return chars.value.filter(char => ids.includes(char.id)).map(char => char.name)
}

function isStoryboardCharacterSelected(sb, charId) {
  return getStoryboardCharacterIds(sb).includes(charId)
}

function toggleStoryboardCharacter(sb, charId) {
  const currentIds = getStoryboardCharacterIds(sb)
  const nextIds = currentIds.includes(charId)
    ? currentIds.filter(id => id !== charId)
    : [...currentIds, charId]
  updateField(sb, 'character_ids', nextIds)
}

function getSceneName(sb) {
  const sceneId = sb?.scene_id || sb?.sceneId
  if (!sceneId) return '未绑定场景'
  const scene = scenes.value.find(item => item.id === sceneId)
  return scene ? `${scene.location} · ${scene.time || '未设时间'}` : `场景 #${sceneId}`
}

async function deleteShot(sb) {
  if (!confirm('确定删除此镜头？')) return
  const index = sbs.value.indexOf(sb)
  await storyboardAPI.del(sb.id)
  await refresh()
  if (sbs.value.length) selectedSb.value = sbs.value[Math.min(index, sbs.value.length - 1)]
  else selectedSb.value = null
}

function saveRaw() {
  chapterAPI.update(epId.value, { content: localRaw.value })
  episode.value.content = localRaw.value
}

function saveScr() {
  chapterAPI.update(epId.value, { script_content: localScript.value })
  episode.value.script_content = localScript.value
}

function doRewrite() {
  saveRaw()
  runAgent('script_rewriter', '请读取剧本并改写为格式化剧本，然后保存。', dramaId, epId.value, refresh)
}

function skipRewrite() {
  const raw = (localRaw.value || rawContent.value || '').trim()
  if (!raw) {
    toast.warning('请先填写原始内容')
    return
  }
  localScript.value = raw
  saveScr()
  toast.success('已跳过 AI 改写，当前将直接使用原始内容')
  scriptStep.value = 2
}

function doExtract() {
  saveScr()
  runAgent('extractor', '请从剧本中提取所有角色和场景信息，提取时自动与项目已有数据进行去重合并。', dramaId, epId.value, refresh)
}

function doBreakdown() {
  const config = videoConfigs.value.find(item => item.id === lockedVideoConfigId.value)
  const label = config ? `${config.name} (${config.provider})` : '默认'
  runAgent(
    'storyboard_breaker',
    `请拆解分镜并生成视频提示词。视频模型：${label}，请根据该模型的特性和时长限制生成合适的视频提示词。`,
    dramaId,
    epId.value,
    refresh,
  )
}

async function addShot() {
  await storyboardAPI.create({
    episode_id: epId.value,
    storyboard_number: sbs.value.length + 1,
    title: `镜头${sbs.value.length + 1}`,
    duration: 10,
  })
  await refresh()
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
  scriptStep,
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

function handleFrameModeChange(value) {
  frameMode.value = value
}

function handleShotSelection(sb) {
  selectedSb.value = sb
}

function handleStoryboardOpen(sb) {
  selectedSb.value = sb
  goSubStep('script:storyboard')
}

function goPrevProd() {
  prodTabIdx.value = Math.max(0, prodTabIdx.value - 1)
}

function handleShotFieldUpdate(payload) {
  if (!payload?.sb || !payload?.field) return
  updateField(payload.sb, payload.field, payload.value)
}

const productionPanelState = computed(() => ({
  scriptContent: scriptContent.value,
  sbs: sbs.value,
  prodTab: prodTab.value,
  prodTabDefs: prodTabDefs.value,
  visualChars: visualChars.value,
  characterAssets: characterAssets.value,
  characterAssetBusy: characterAssetBusy.value,
  chars: chars.value,
  scenes: scenes.value,
  lockedImageConfigLabel: lockedImageConfigLabel.value,
  pendingCharImageIds: pendingCharImageIds.value,
  pendingSceneImageIds: pendingSceneImageIds.value,
  replacingCharacterImageIds: replacingCharacterImageIds.value,
  replacingSceneImageIds: replacingSceneImageIds.value,
  shotImgCount: shotImgCount.value,
  lockedImageModelName: lockedImageModelName.value,
  lockedImageProvider: lockedImageProvider.value,
  selectedSbId: selectedSb.value?.id || 0,
  referenceOptions: shotReferenceOptions.value,
  shotImageHistory: shotImageHistory.value,
  frameMode: frameMode.value,
  frameModeOptions,
  shotImageAspectRatio: shotImageAspectRatio.value,
  shotImageAspectRatioOptions,
  shotImageSizePreset: shotImageSizePreset.value,
  shotImageSizePresetOptions,
  shotImageResolvedSize: shotImageResolvedSize.value,
  gridImagePath: gridImagePath.value,
  gridActualLayout: gridActualLayout.value,
  gridRecoveredMode: gridRecoveredMode.value,
  gridRecoveredAt: gridRecoveredAt.value,
  showAllGridHistory: showAllGridHistory.value,
  gridHistory: gridHistory.value,
  gridDialog: gridDialog.value,
  gridStep: gridStep.value,
  gridModes,
  gridMode: gridMode.value,
  gridLayout: gridLayout.value,
  gridLayoutOptions,
  gridSelected: gridSelected.value,
  gridSingleTarget: gridSingleTarget.value,
  gridCanStart: gridCanStart.value,
  gridAutoLayout: gridAutoLayout.value,
  gridPromptLoading: gridPromptLoading.value,
  gridPromptStatus: gridPromptStatus.value,
  gridSummary: gridSummary.value,
  gridPromptSource: gridPromptSource.value,
  gridPromptText: gridPromptText.value,
  gridCellPrompts: gridCellPrompts.value,
  gridBlankStyle: gridBlankStyle.value,
  gridStatusText: gridStatusText.value,
  gridOverlayStyle: gridOverlayStyle.value,
  gridAssignments: gridAssignments.value,
  activeGridCell: activeGridCell.value,
  gridAssignedCount: gridAssignedCount.value,
  gridAssignmentTotalPages: gridAssignmentTotalPages.value,
  gridAssignmentPage: gridAssignmentPage.value,
  gridAssignmentPageStart: gridAssignmentPageStart.value,
  gridAssignmentPageEnd: gridAssignmentPageEnd.value,
  pagedGridAssignments: pagedGridAssignments.value,
  gridAssignmentShotOptions: gridAssignmentShotOptions.value,
  gridFrameTypeOptions: gridFrameTypeOptions.value,
  getFirstFrame,
  getLastFrame,
  getRefs,
  getShotReferenceImages,
  getShotManualReferenceImages,
  isPendingShotFrame,
  gridCellLabel,
  gridCellTitle,
  lockedVideoConfigLabel: lockedVideoConfigLabel.value,
  shotVidCount: shotVidCount.value,
  lockedVideoProvider: lockedVideoProvider.value,
  lockedVideoModelName: lockedVideoModelName.value,
  activeVideoSb: activeVideoSb.value,
  activeVideoShotIndexLabel: activeVideoShotIndexLabel.value,
  hasVid,
  getVideoUrl,
  hasImg,
  getStoryboardCover,
  getVideoStateClass,
  getVideoStateText,
  getVideoReferenceSummary,
  isPendingVideo,
  videoFailMessage,
  getVideoGenerateActionLabel,
  buildDefaultVideoPrompt,
}))

const productionPanelHandlers = {
  goScript: () => { panel.value = 'script' },
  setProdTab: (value) => { prodTab.value = value },
  batchCharImages,
  genCharImg,
  replaceCharImage,
  handleCharacterDescriptionUpdate,
  handleCharacterAssetUpload,
  handleCharacterAssetBind,
  handleCharacterAssetDefault,
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
  setGridDialog: (value) => { gridDialog.value = value },
  handleGridModeChange,
  setGridLayout: (value) => { gridLayout.value = value },
  gridSelectAll,
  handleGridShotToggle,
  setGridSingleTarget: (value) => {
    gridSingleTarget.value = value === null || value === undefined || value === '' ? null : Number(value)
  },
  generateGridPrompt,
  startGridGen,
  setGridStep: (value) => { gridStep.value = Number(value) || 0 },
  focusGridCell,
  handleGridAssignmentPageChange,
  handleGridAssignmentUpdate,
  doGridSplit,
  handleGridDialogFinish,
  batchVideos,
  genVid,
  openImageByPath: (path, title) => {
    if (path) openImageViewer(assetUrl(path), title)
  },
}

onMounted(() => {
  restoreShotImagePreferences()
  refresh()
  loadConfigs()
})
</script>


<style>
@import url('@/assets/episode-studio.css');
</style>

