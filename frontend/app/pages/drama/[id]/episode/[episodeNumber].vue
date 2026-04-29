<template>
  <div class="studio" v-if="drama">
    <EpisodeStudioTopbar
      :drama-title="drama.title"
      :episode-number="episodeNumber"
      :current-sub-stage-label="currentSubStageLabel"
      :pipeline-progress="pipelineProgress"
      :character-count="chars.length"
      :shot-count="sbs.length"
      :has-merge-output="!!mergeUrl"
      @back="navigateTo(`/drama/${dramaId}`)"
      @refresh="refresh"
      @primary-action="panel = mergeUrl ? 'export' : (sbs.length ? 'production' : 'script')"
    />

    <div class="studio-body">
    <!-- ========== LEFT SIDEBAR ========== -->
    <EpisodeStudioSidebar
      :sidebar-sections="sidebarSections"
      :active-sub-step-key="activeSubStepKey"
      :pipeline-progress="pipelineProgress"
      :sidebar-jump-steps="sidebarJumpSteps"
      @go-sub-step="goSubStep"
      @refresh="refresh"
    />

    <!-- ========== MAIN CONTENT ========== -->
    <main class="main">
      <EpisodeStudioSubnav
        :active-sub-steps="activeSubSteps"
        :active-sub-step-key="activeSubStepKey"
        @go-sub-step="goSubStep"
      />

      <!-- ===== SCRIPT PANEL ===== -->
      <div v-if="panel === 'script'" class="content-panel">
        <EpisodeScriptSteps
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
        <EpisodeStoryboardEditor
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
      <EpisodeProductionPanel
        v-else-if="panel === 'production'"
        :state="productionPanelState"
        :handlers="productionPanelHandlers"
      />

      <!-- ===== EXPORT PANEL ===== -->
      <EpisodeExportPanel
        v-else
        :sbs="sbs"
        :merge-url="mergeUrl"
        :composed-count="composedCount"
        :total-duration="totalDuration"
        :has-composed="hasComposed"
        @go-script="panel = 'script'"
        @merge="doMerge"
      />

      <EpisodeBottomBubble
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

      <EpisodeImageViewer :image-viewer="imageViewer" @close="closeImageViewer" />

    </main>
    </div>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import { Loader2 } from 'lucide-vue-next'
import { dramaAPI, episodeAPI, storyboardAPI, characterAPI, sceneAPI, mergeAPI, aiConfigAPI } from '~/composables/useApi'
import { useAgent } from '~/composables/useAgent'
import EpisodeBottomBubble from '~/components/episode/EpisodeBottomBubble.vue'
import EpisodeExportPanel from '~/components/episode/EpisodeExportPanel.vue'
import EpisodeImageViewer from '~/components/episode/EpisodeImageViewer.vue'
import EpisodeProductionPanel from '~/components/episode/EpisodeProductionPanel.vue'
import EpisodeScriptSteps from '~/components/episode/EpisodeScriptSteps.vue'
import EpisodeStudioSidebar from '~/components/episode/EpisodeStudioSidebar.vue'
import EpisodeStudioSubnav from '~/components/episode/EpisodeStudioSubnav.vue'
import EpisodeStudioTopbar from '~/components/episode/EpisodeStudioTopbar.vue'
import EpisodeStoryboardEditor from '~/components/episode/EpisodeStoryboardEditor.vue'
import { useEpisodeGridTool } from '~/composables/episode/useEpisodeGridTool'
import { useEpisodeImageViewer } from '~/composables/episode/useEpisodeImageViewer'
import { useEpisodeMediaPipeline } from '~/composables/episode/useEpisodeMediaPipeline'
import { useEpisodeStudioNavigation } from '~/composables/episode/useEpisodeStudioNavigation'
import {
  SHOT_IMAGE_ASPECT_RATIO_OPTIONS,
  SHOT_IMAGE_SIZE_PRESET_OPTIONS,
  isShotImageAspectRatio,
  isShotImageSizePreset,
  resolveShotImageSize,
} from '~/utils/shot-image-size'

definePageMeta({ layout: 'studio' })

const route = useRoute()
const dramaId = Number(route.params.id)
const episodeNumber = Number(route.params.episodeNumber)

const drama = ref(null)
const episode = ref(null)
const chars = ref([])
const scenes = ref([])
const sbs = ref([])
const mergeData = ref(null)
const selectedSb = ref(null)

const { running: rn, runningType: rt, run: runAgent } = useAgent()

const localRaw = ref('')
const localScript = ref('')
const frameMode = ref('first')
const shotImageAspectRatio = ref('16:9')
const shotImageSizePreset = ref('2K')
const imageConfigs = ref([])
const videoConfigs = ref([])

const rawContent = computed(() => episode.value?.content || '')
const scriptContent = computed(() => episode.value?.script_content || episode.value?.scriptContent || '')
const epId = computed(() => episode.value?.id || 0)
const rawLen = computed(() => localRaw.value.replace(/\s/g, '').length || 0)
const scriptLen = computed(() => localScript.value.replace(/\s/g, '').length || 0)
const composedCount = computed(() => sbs.value.filter(sb => sb.composed_video_url || sb.composedVideoUrl).length)
const mergeUrl = computed(() => mergeData.value?.merged_url || mergeData.value?.mergedUrl || null)

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

function configModelName(config) {
  if (!config) return ''
  if (Array.isArray(config.model)) return config.model[0] || config.name || ''
  try {
    const model = JSON.parse(config.model || '[]')
    return Array.isArray(model) ? (model[0] || config.name || '') : (model || config.name || '')
  } catch {
    return config.model || config.name || ''
  }
}

function configLabel(config) {
  if (!config) return '未配置'
  const modelName = configModelName(config)
  return modelName ? `${config.name} · ${modelName} (${config.provider})` : `${config.name} (${config.provider})`
}

const dramaImageConfigId = computed(() => drama.value?.image_config_id || drama.value?.imageConfigId || null)
const dramaVideoConfigId = computed(() => drama.value?.video_config_id || drama.value?.videoConfigId || null)
const episodeImageConfigId = computed(() => episode.value?.image_config_id || episode.value?.imageConfigId || null)
const episodeVideoConfigId = computed(() => episode.value?.video_config_id || episode.value?.videoConfigId || null)
const lockedImageConfigId = computed(() => episodeImageConfigId.value || dramaImageConfigId.value || imageConfigs.value[0]?.id || null)
const lockedVideoConfigId = computed(() => episodeVideoConfigId.value || dramaVideoConfigId.value || videoConfigs.value[0]?.id || null)
const lockedImageProvider = computed(() => imageConfigs.value.find(config => config.id === lockedImageConfigId.value)?.provider || '')
const lockedVideoProvider = computed(() => videoConfigs.value.find(config => config.id === lockedVideoConfigId.value)?.provider || '')
const lockedImageConfigLabel = computed(() => configLabel(imageConfigs.value.find(config => config.id === lockedImageConfigId.value)))
const lockedImageModelName = computed(() => configModelName(imageConfigs.value.find(config => config.id === lockedImageConfigId.value)))
const lockedVideoConfigLabel = computed(() => configLabel(videoConfigs.value.find(config => config.id === lockedVideoConfigId.value)))
const lockedVideoModelName = computed(() => configModelName(videoConfigs.value.find(config => config.id === lockedVideoConfigId.value)))
const syncingEpisodeConfigIds = ref(false)
const syncedEpisodeConfigKeys = ref(new Set())
const shotImageResolvedSize = computed(() => resolveShotImageSize(shotImageAspectRatio.value, shotImageSizePreset.value))
const shotImagePrefsKey = computed(() => `aidrama:shot-image-prefs:${dramaId}:${epId.value || episodeNumber}`)

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
watch(
  [() => episode.value?.id, episodeImageConfigId, episodeVideoConfigId, lockedImageConfigId, lockedVideoConfigId],
  async ([episodeId, imageConfigId, videoConfigId, fallbackImageConfigId, fallbackVideoConfigId]) => {
    if (!episodeId || syncingEpisodeConfigIds.value) return

    const nextImageConfigId = imageConfigId || fallbackImageConfigId || null
    const nextVideoConfigId = videoConfigId || fallbackVideoConfigId || null
    const shouldSyncImage = !imageConfigId && !!nextImageConfigId
    const shouldSyncVideo = !videoConfigId && !!nextVideoConfigId
    if (!shouldSyncImage && !shouldSyncVideo) return

    const syncKey = `${episodeId}:${nextImageConfigId || 0}:${nextVideoConfigId || 0}`
    if (syncedEpisodeConfigKeys.value.has(syncKey)) return

    syncingEpisodeConfigIds.value = true
    try {
      const payload = {}
      if (shouldSyncImage) payload.image_config_id = nextImageConfigId
      if (shouldSyncVideo) payload.video_config_id = nextVideoConfigId
      await episodeAPI.update(episodeId, payload)
      episode.value = {
        ...episode.value,
        ...(shouldSyncImage ? { image_config_id: nextImageConfigId } : {}),
        ...(shouldSyncVideo ? { video_config_id: nextVideoConfigId } : {}),
      }
      syncedEpisodeConfigKeys.value.add(syncKey)
    } catch (error) {
      console.error('Failed to sync episode config ids', error)
    } finally {
      syncingEpisodeConfigIds.value = false
    }
  },
  { immediate: true },
)

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
  episodeAPI.update(epId.value, { content: localRaw.value })
  episode.value.content = localRaw.value
}

function saveScr() {
  episodeAPI.update(epId.value, { script_content: localScript.value })
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
  try {
    drama.value = await dramaAPI.get(dramaId)
    const currentEpisode = drama.value.episodes?.find(item => (item.episode_number || item.episodeNumber) === episodeNumber)
    if (currentEpisode) {
      episode.value = currentEpisode
      try { chars.value = await episodeAPI.characters(currentEpisode.id) } catch { chars.value = [] }
      try { scenes.value = await episodeAPI.scenes(currentEpisode.id) } catch { scenes.value = [] }
      sbs.value = await episodeAPI.storyboards(currentEpisode.id)

      if (!sbs.value.length) selectedSb.value = null
      else if (!selectedSb.value || !sbs.value.some(sb => sb.id === selectedSb.value.id)) selectedSb.value = sbs.value[0]

      syncScriptStep()
      await loadLatestGridImage()
    }
  } catch (error) {
    toast.error(error.message)
  }

  try {
    mergeData.value = await mergeAPI.status(epId.value)
  } catch {}
}

async function loadConfigs() {
  try {
    const [imageRows, videoRows] = await Promise.all([
      aiConfigAPI.list('image'),
      aiConfigAPI.list('video'),
    ])
    imageConfigs.value = imageRows || []
    videoConfigs.value = videoRows || []
  } catch (error) {
    console.error('Failed to load AI configs', error)
  }
}

const { imageViewer, openImageViewer, closeImageViewer, handleGalleryViewerOpen } = useEpisodeImageViewer()

const {
  pendingCharImageIds,
  pendingSceneImageIds,
  replacingCharacterImageIds,
  replacingSceneImageIds,
  pendingVideoIds,
  pendingComposeIds,
  shotImageHistory,
  isPendingCharImage,
  isPendingSceneImage,
  isPendingShotFrame,
  isPendingVideo,
  videoFailMessage,
  isPendingCompose,
  composeFailMessage,
  getStoryboardStateText,
  getStoryboardStateClass,
  getVideoGenerateActionLabel,
  getVideoStateText,
  getVideoStateClass,
  getVideoReferenceSummary,
  buildDefaultVideoPrompt,
  getComposeStateText,
  getComposeStateClass,
  getComposeActionLabel,
  getComposeSourceSummary,
  activeVideoSb,
  activeVideoShotIndexLabel,
  getFirstFrame,
  getLastFrame,
  getStoryboardCover,
  getVideoUrl,
  getComposedVideoUrl,
  hasImg,
  hasVid,
  hasComposed,
  getShotReferenceImages,
  getShotManualReferenceImages,
  genCharImg,
  replaceCharImage,
  batchCharImages,
  genSceneImg,
  replaceSceneImage,
  batchSceneImages,
  genVid,
  doCompose,
  batchVideos,
  batchCompose,
  doMerge,
  handleShotFrameGenerate,
  handleShotFrameRestore,
} = useEpisodeMediaPipeline({
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
} = useEpisodeGridTool({
  dramaId,
  episodeNumber,
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
} = useEpisodeStudioNavigation({
  rawContent,
  scriptContent,
  localRaw,
  localScript,
  chars,
  scenes,
  sbs,
  visualChars,
  composedCount,
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
  hasComposed,
  getVideoStateClass,
  getVideoStateText,
  getVideoReferenceSummary,
  isPendingVideo,
  videoFailMessage,
  getVideoGenerateActionLabel,
  buildDefaultVideoPrompt,
  composedCount: composedCount.value,
  getComposedVideoUrl,
  getComposeStateClass,
  getComposeStateText,
  getComposeSourceSummary,
  composeFailMessage,
  isPendingCompose,
  getComposeActionLabel,
}))

const productionPanelHandlers = {
  goScript: () => { panel.value = 'script' },
  setProdTab: (value) => { prodTab.value = value },
  batchCharImages,
  genCharImg,
  replaceCharImage,
  handleCharacterDescriptionUpdate,
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
  batchCompose,
  doCompose,
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
@import url('~/assets/episode-studio.css');
</style>

