import assert from 'node:assert/strict'

import { computed, ref } from 'vue'

import { useChapterProductionPanelBridge } from '../useChapterProductionPanelBridge.ts'

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

const noop = () => undefined

await runTest('production bridge unwraps state and owns small page handlers', () => {
  const panel = ref('production')
  const prodTab = ref('chars')
  const gridDialog = ref(false)
  const gridLayout = ref('2x2')
  const gridSingleTarget = ref<number | null>(9)
  const gridStep = ref(1)
  const gridAssignmentPage = ref(1)
  const openedImages: Array<{ path: string; title?: string }> = []
  const bridge = useChapterProductionPanelBridge({
    panel,
    scriptContent: computed(() => 'script'),
    sbs: ref([{ id: 1 }]),
    prodTab,
    prodTabDefs: computed(() => [{ id: 'chars', label: 'Chars' }]),
    visualChars: computed(() => [{ id: 2 }]),
    characterAssets: ref([]),
    characterAssetBusy: ref(false),
    chars: ref([{ id: 2 }]),
    scenes: ref([]),
    lockedImageConfigLabel: computed(() => 'image config'),
    pendingCharImageIds: ref([2]),
    pendingSceneImageIds: ref([]),
    replacingCharacterImageIds: ref([]),
    replacingSceneImageIds: ref([]),
    shotImgCount: computed(() => 1),
    lockedImageModelName: computed(() => 'seedream'),
    lockedImageProvider: computed(() => 'volcengine'),
    selectedSb: ref({ id: 1 }),
    shotReferenceOptions: computed(() => []),
    shotImageHistory: ref({}),
    frameMode: ref('first'),
    frameModeOptions: [],
    shotImageAspectRatio: ref('16:9'),
    shotImageAspectRatioOptions: [],
    shotImageSizePreset: ref('2K'),
    shotImageSizePresetOptions: [],
    shotImageResolvedSize: computed(() => '2560x1440'),
    gridImagePath: ref('grid.png'),
    gridActualLayout: computed(() => '2x2'),
    gridRecoveredMode: ref('manual'),
    gridRecoveredAt: ref(1),
    showAllGridHistory: ref(false),
    gridHistory: ref([]),
    gridDialog,
    gridStep,
    gridModes: [],
    gridMode: ref('batch'),
    gridLayout,
    gridLayoutOptions: [],
    gridSelected: ref([]),
    gridSingleTarget,
    gridCanStart: computed(() => true),
    gridAutoLayout: computed(() => '2x2'),
    gridPromptLoading: ref(false),
    gridPromptStatus: ref('ready'),
    gridSummary: computed(() => 'summary'),
    gridPromptSource: ref('manual'),
    gridPromptText: ref('prompt'),
    gridCellPrompts: ref([]),
    gridBlankStyle: computed(() => ({})),
    gridStatusText: computed(() => 'ready'),
    gridOverlayStyle: computed(() => ({})),
    gridAssignments: computed(() => []),
    activeGridCell: ref(null),
    gridAssignedCount: computed(() => 0),
    gridAssignmentTotalPages: computed(() => 1),
    gridAssignmentPage,
    gridAssignmentPageStart: computed(() => 1),
    gridAssignmentPageEnd: computed(() => 1),
    pagedGridAssignments: computed(() => []),
    gridAssignmentShotOptions: computed(() => []),
    gridFrameTypeOptions: [],
    lockedVideoConfigLabel: computed(() => 'video config'),
    shotVidCount: computed(() => 0),
    lockedVideoProvider: computed(() => 'vidu'),
    lockedVideoModelName: computed(() => 'vidu2'),
    activeVideoSb: computed(() => null),
    activeVideoShotIndexLabel: computed(() => '01'),
    videoFailMessage: noop,
    getFirstFrame: noop,
    getLastFrame: noop,
    getRefs: noop,
    getShotReferenceImages: noop,
    getShotManualReferenceImages: noop,
    isPendingShotFrame: noop,
    gridCellLabel: noop,
    gridCellTitle: noop,
    hasVid: noop,
    getVideoUrl: noop,
    hasImg: noop,
    getStoryboardCover: noop,
    getVideoStateClass: noop,
    getVideoStateText: noop,
    getVideoReferenceSummary: noop,
    isPendingVideo: noop,
    getVideoHistory: noop,
    isVideoHistoryLoading: noop,
    loadVideoHistory: noop,
    videoHistoryUrl: noop,
    getVideoGenerateActionLabel: noop,
    buildDefaultVideoPrompt: noop,
    batchCharImages: noop,
    genCharImg: noop,
    replaceCharImage: noop,
    handleCharacterDescriptionUpdate: noop,
    handleCharacterAssetUpload: noop,
    handleCharacterAssetBind: noop,
    handleGalleryViewerOpen: noop,
    batchSceneImages: noop,
    genSceneImg: noop,
    replaceSceneImage: noop,
    handleSceneFieldUpdate: noop,
    handleFrameModeChange: noop,
    handleShotImageAspectRatioChange: noop,
    handleShotImageSizePresetChange: noop,
    openGridTool: noop,
    reopenGridPreview: noop,
    continueGridSplit: noop,
    handleGridHistoryToggle: noop,
    selectGridHistory: noop,
    handleShotSelection: noop,
    handleStoryboardOpen: noop,
    handleShotFieldUpdate: noop,
    handleShotFrameGenerate: noop,
    handleShotFrameRestore: noop,
    handleGridModeChange: noop,
    gridSelectAll: noop,
    handleGridShotToggle: noop,
    generateGridPrompt: noop,
    startGridGen: noop,
    focusGridCell: noop,
    handleGridAssignmentPageChange: noop,
    handleGridAssignmentUpdate: noop,
    doGridSplit: noop,
    handleGridDialogFinish: noop,
    batchVideos: noop,
    genVid: noop,
    restoreVideoFromHistory: noop,
    openImageViewer: (path, title) => openedImages.push({ path, title }),
    resolveAssetUrl: path => `/asset/${path}`,
  })

  assert.equal(bridge.productionPanelState.value.scriptContent, 'script')
  assert.equal(bridge.productionPanelState.value.selectedSbId, 1)
  assert.deepEqual(bridge.productionPanelState.value.pendingCharImageIds, [2])

  bridge.productionPanelHandlers.goScript()
  bridge.productionPanelHandlers.setProdTab('videos')
  bridge.productionPanelHandlers.setGridDialog(true)
  bridge.productionPanelHandlers.setGridLayout('4x4')
  bridge.productionPanelHandlers.setGridSingleTarget('')
  bridge.productionPanelHandlers.setGridStep('3')
  bridge.productionPanelHandlers.openImageByPath('image.png', 'Preview')

  assert.equal(panel.value, 'script')
  assert.equal(prodTab.value, 'videos')
  assert.equal(gridDialog.value, true)
  assert.equal(gridLayout.value, '4x4')
  assert.equal(gridSingleTarget.value, null)
  assert.equal(gridStep.value, 3)
  assert.deepEqual(openedImages, [{ path: '/asset/image.png', title: 'Preview' }])
})
