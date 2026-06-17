import { computed, type ComputedRef, type Ref } from 'vue'

type ValueRef<T = unknown> = Ref<T> | ComputedRef<T>
type BridgeHandler = (...args: unknown[]) => unknown

type ProductionPanelBridgeOptions = {
  panel: Ref<string>
  scriptContent: ValueRef<string>
  sbs: ValueRef<unknown[]>
  prodTab: Ref<string>
  prodTabDefs: ValueRef<unknown[]>
  visualChars: ValueRef<unknown[]>
  characterAssets: ValueRef<unknown[]>
  characterAssetBusy: ValueRef<boolean>
  manualAssetBusy: ValueRef<boolean>
  chars: ValueRef<unknown[]>
  scenes: ValueRef<unknown[]>
  lockedImageConfigLabel: ValueRef<string>
  pendingCharImageIds: ValueRef<unknown[]>
  pendingSceneImageIds: ValueRef<unknown[]>
  replacingCharacterImageIds: ValueRef<unknown[]>
  replacingSceneImageIds: ValueRef<unknown[]>
  uploadingSceneReferenceIds: ValueRef<unknown[]>
  shotImgCount: ValueRef<number>
  lockedImageModelName: ValueRef<string>
  lockedImageProvider: ValueRef<string>
  selectedSb: ValueRef<{ id?: number } | null>
  shotReferenceOptions: ValueRef<unknown[]>
  shotImageHistory: ValueRef<unknown>
  frameMode: ValueRef<string>
  frameModeOptions: unknown
  shotImageAspectRatio: ValueRef<string>
  shotImageAspectRatioOptions: unknown
  shotImageSizePreset: ValueRef<string>
  shotImageSizePresetOptions: unknown
  shotImageResolvedSize: ValueRef<string>
  gridImagePath: ValueRef<unknown>
  gridActualLayout: ValueRef<unknown>
  gridRecoveredMode: ValueRef<unknown>
  gridRecoveredAt: ValueRef<unknown>
  showAllGridHistory: ValueRef<boolean>
  gridHistory: ValueRef<unknown[]>
  gridDialog: Ref<boolean>
  gridStep: Ref<number>
  gridModes: unknown
  gridMode: ValueRef<unknown>
  gridLayout: Ref<unknown>
  gridLayoutOptions: unknown
  gridSelected: ValueRef<unknown>
  gridSingleTarget: Ref<number | null>
  gridCanStart: ValueRef<boolean>
  gridAutoLayout: ValueRef<unknown>
  gridPromptLoading: ValueRef<boolean>
  gridPromptStatus: ValueRef<unknown>
  gridSummary: ValueRef<unknown>
  gridPromptSource: ValueRef<unknown>
  gridPromptText: ValueRef<unknown>
  gridCellPrompts: ValueRef<unknown>
  gridBlankStyle: ValueRef<unknown>
  gridStatusText: ValueRef<unknown>
  gridOverlayStyle: ValueRef<unknown>
  gridAssignments: ValueRef<unknown>
  activeGridCell: ValueRef<unknown>
  gridAssignedCount: ValueRef<number>
  gridAssignmentTotalPages: ValueRef<number>
  gridAssignmentPage: Ref<number>
  gridAssignmentPageStart: ValueRef<number>
  gridAssignmentPageEnd: ValueRef<number>
  pagedGridAssignments: ValueRef<unknown>
  gridAssignmentShotOptions: ValueRef<unknown>
  gridFrameTypeOptions: unknown
  lockedVideoConfigLabel: ValueRef<string>
  shotVidCount: ValueRef<number>
  lockedVideoProvider: ValueRef<string>
  lockedVideoModelName: ValueRef<string>
  activeVideoSb: ValueRef<unknown>
  activeVideoShotIndexLabel: ValueRef<string>
  videoFailMessage: BridgeHandler
  videoBillingInfo: BridgeHandler
  getFirstFrame: BridgeHandler
  getLastFrame: BridgeHandler
  getRefs: BridgeHandler
  getShotReferenceImages: BridgeHandler
  getShotManualReferenceImages: BridgeHandler
  isPendingShotFrame: BridgeHandler
  gridCellLabel: BridgeHandler
  gridCellTitle: BridgeHandler
  hasVid: BridgeHandler
  getVideoUrl: BridgeHandler
  hasImg: BridgeHandler
  getStoryboardCover: BridgeHandler
  getVideoStateClass: BridgeHandler
  getVideoStateText: BridgeHandler
  getVideoReferenceSummary: BridgeHandler
  isPendingVideo: BridgeHandler
  getVideoHistory: BridgeHandler
  isVideoHistoryLoading: BridgeHandler
  loadVideoHistory: BridgeHandler
  videoHistoryUrl: BridgeHandler
  getVideoGenerateActionLabel: BridgeHandler
  buildDefaultVideoPrompt: BridgeHandler
  batchCharImages: BridgeHandler
  genCharImg: BridgeHandler
  handleManualCharacterAdd: BridgeHandler
  replaceCharImage: BridgeHandler
  handleCharacterDescriptionUpdate: BridgeHandler
  handleCharacterAssetUpload: BridgeHandler
  handleCharacterAssetBind: BridgeHandler
  handleGalleryViewerOpen: BridgeHandler
  batchSceneImages: BridgeHandler
  genSceneImg: BridgeHandler
  handleManualSceneAdd: BridgeHandler
  replaceSceneImage: BridgeHandler
  uploadSceneReference: BridgeHandler
  clearSceneReference: BridgeHandler
  handleSceneFieldUpdate: BridgeHandler
  handleFrameModeChange: BridgeHandler
  handleShotImageAspectRatioChange: BridgeHandler
  handleShotImageSizePresetChange: BridgeHandler
  openGridTool: BridgeHandler
  reopenGridPreview: BridgeHandler
  continueGridSplit: BridgeHandler
  handleGridHistoryToggle: BridgeHandler
  selectGridHistory: BridgeHandler
  handleShotSelection: BridgeHandler
  handleStoryboardOpen: BridgeHandler
  handleShotFieldUpdate: BridgeHandler
  handleShotFrameGenerate: BridgeHandler
  handleShotFrameRestore: BridgeHandler
  handleGridModeChange: BridgeHandler
  gridSelectAll: BridgeHandler
  handleGridShotToggle: BridgeHandler
  generateGridPrompt: BridgeHandler
  startGridGen: BridgeHandler
  focusGridCell: BridgeHandler
  handleGridAssignmentPageChange: BridgeHandler
  handleGridAssignmentUpdate: BridgeHandler
  doGridSplit: BridgeHandler
  handleGridDialogFinish: BridgeHandler
  batchVideos: BridgeHandler
  genVid: BridgeHandler
  retryVideoBilling: BridgeHandler
  restoreVideoFromHistory: BridgeHandler
  openImageViewer: (path: string, title?: string) => unknown
  resolveAssetUrl: (path: string) => string
}

export function useChapterProductionPanelBridge(options: ProductionPanelBridgeOptions) {
  const productionPanelState = computed(() => ({
    scriptContent: options.scriptContent.value,
    sbs: options.sbs.value,
    prodTab: options.prodTab.value,
    prodTabDefs: options.prodTabDefs.value,
    visualChars: options.visualChars.value,
    characterAssets: options.characterAssets.value,
    characterAssetBusy: options.characterAssetBusy.value,
    manualAssetBusy: options.manualAssetBusy.value,
    chars: options.chars.value,
    scenes: options.scenes.value,
    lockedImageConfigLabel: options.lockedImageConfigLabel.value,
    pendingCharImageIds: options.pendingCharImageIds.value,
    pendingSceneImageIds: options.pendingSceneImageIds.value,
    replacingCharacterImageIds: options.replacingCharacterImageIds.value,
    replacingSceneImageIds: options.replacingSceneImageIds.value,
    uploadingSceneReferenceIds: options.uploadingSceneReferenceIds.value,
    shotImgCount: options.shotImgCount.value,
    lockedImageModelName: options.lockedImageModelName.value,
    lockedImageProvider: options.lockedImageProvider.value,
    selectedSbId: options.selectedSb.value?.id || 0,
    referenceOptions: options.shotReferenceOptions.value,
    shotImageHistory: options.shotImageHistory.value,
    frameMode: options.frameMode.value,
    frameModeOptions: options.frameModeOptions,
    shotImageAspectRatio: options.shotImageAspectRatio.value,
    shotImageAspectRatioOptions: options.shotImageAspectRatioOptions,
    shotImageSizePreset: options.shotImageSizePreset.value,
    shotImageSizePresetOptions: options.shotImageSizePresetOptions,
    shotImageResolvedSize: options.shotImageResolvedSize.value,
    gridImagePath: options.gridImagePath.value,
    gridActualLayout: options.gridActualLayout.value,
    gridRecoveredMode: options.gridRecoveredMode.value,
    gridRecoveredAt: options.gridRecoveredAt.value,
    showAllGridHistory: options.showAllGridHistory.value,
    gridHistory: options.gridHistory.value,
    gridDialog: options.gridDialog.value,
    gridStep: options.gridStep.value,
    gridModes: options.gridModes,
    gridMode: options.gridMode.value,
    gridLayout: options.gridLayout.value,
    gridLayoutOptions: options.gridLayoutOptions,
    gridSelected: options.gridSelected.value,
    gridSingleTarget: options.gridSingleTarget.value,
    gridCanStart: options.gridCanStart.value,
    gridAutoLayout: options.gridAutoLayout.value,
    gridPromptLoading: options.gridPromptLoading.value,
    gridPromptStatus: options.gridPromptStatus.value,
    gridSummary: options.gridSummary.value,
    gridPromptSource: options.gridPromptSource.value,
    gridPromptText: options.gridPromptText.value,
    gridCellPrompts: options.gridCellPrompts.value,
    gridBlankStyle: options.gridBlankStyle.value,
    gridStatusText: options.gridStatusText.value,
    gridOverlayStyle: options.gridOverlayStyle.value,
    gridAssignments: options.gridAssignments.value,
    activeGridCell: options.activeGridCell.value,
    gridAssignedCount: options.gridAssignedCount.value,
    gridAssignmentTotalPages: options.gridAssignmentTotalPages.value,
    gridAssignmentPage: options.gridAssignmentPage.value,
    gridAssignmentPageStart: options.gridAssignmentPageStart.value,
    gridAssignmentPageEnd: options.gridAssignmentPageEnd.value,
    pagedGridAssignments: options.pagedGridAssignments.value,
    gridAssignmentShotOptions: options.gridAssignmentShotOptions.value,
    gridFrameTypeOptions: options.gridFrameTypeOptions,
    getFirstFrame: options.getFirstFrame,
    getLastFrame: options.getLastFrame,
    getRefs: options.getRefs,
    getShotReferenceImages: options.getShotReferenceImages,
    getShotManualReferenceImages: options.getShotManualReferenceImages,
    isPendingShotFrame: options.isPendingShotFrame,
    gridCellLabel: options.gridCellLabel,
    gridCellTitle: options.gridCellTitle,
    lockedVideoConfigLabel: options.lockedVideoConfigLabel.value,
    shotVidCount: options.shotVidCount.value,
    lockedVideoProvider: options.lockedVideoProvider.value,
    lockedVideoModelName: options.lockedVideoModelName.value,
    activeVideoSb: options.activeVideoSb.value,
    activeVideoShotIndexLabel: options.activeVideoShotIndexLabel.value,
    hasVid: options.hasVid,
    getVideoUrl: options.getVideoUrl,
    hasImg: options.hasImg,
    getStoryboardCover: options.getStoryboardCover,
    getVideoStateClass: options.getVideoStateClass,
    getVideoStateText: options.getVideoStateText,
    getVideoReferenceSummary: options.getVideoReferenceSummary,
    isPendingVideo: options.isPendingVideo,
    videoFailMessage: options.videoFailMessage,
    videoBillingInfo: options.videoBillingInfo,
    getVideoHistory: options.getVideoHistory,
    isVideoHistoryLoading: options.isVideoHistoryLoading,
    loadVideoHistory: options.loadVideoHistory,
    videoHistoryUrl: options.videoHistoryUrl,
    getVideoGenerateActionLabel: options.getVideoGenerateActionLabel,
    buildDefaultVideoPrompt: options.buildDefaultVideoPrompt,
  }))

  const productionPanelHandlers = {
    goScript: () => { options.panel.value = 'script' },
    setProdTab: (value: string) => { options.prodTab.value = value },
    batchCharImages: options.batchCharImages,
    genCharImg: options.genCharImg,
    handleManualCharacterAdd: options.handleManualCharacterAdd,
    replaceCharImage: options.replaceCharImage,
    handleCharacterDescriptionUpdate: options.handleCharacterDescriptionUpdate,
    handleCharacterAssetUpload: options.handleCharacterAssetUpload,
    handleCharacterAssetBind: options.handleCharacterAssetBind,
    handleGalleryViewerOpen: options.handleGalleryViewerOpen,
    batchSceneImages: options.batchSceneImages,
    genSceneImg: options.genSceneImg,
    handleManualSceneAdd: options.handleManualSceneAdd,
    replaceSceneImage: options.replaceSceneImage,
    uploadSceneReference: options.uploadSceneReference,
    clearSceneReference: options.clearSceneReference,
    handleSceneFieldUpdate: options.handleSceneFieldUpdate,
    handleFrameModeChange: options.handleFrameModeChange,
    handleShotImageAspectRatioChange: options.handleShotImageAspectRatioChange,
    handleShotImageSizePresetChange: options.handleShotImageSizePresetChange,
    openGridTool: options.openGridTool,
    reopenGridPreview: options.reopenGridPreview,
    continueGridSplit: options.continueGridSplit,
    handleGridHistoryToggle: options.handleGridHistoryToggle,
    selectGridHistory: options.selectGridHistory,
    handleShotSelection: options.handleShotSelection,
    handleStoryboardOpen: options.handleStoryboardOpen,
    handleShotFieldUpdate: options.handleShotFieldUpdate,
    handleShotFrameGenerate: options.handleShotFrameGenerate,
    handleShotFrameRestore: options.handleShotFrameRestore,
    setGridDialog: (value: boolean) => { options.gridDialog.value = value },
    handleGridModeChange: options.handleGridModeChange,
    setGridLayout: (value: unknown) => { options.gridLayout.value = value },
    gridSelectAll: options.gridSelectAll,
    handleGridShotToggle: options.handleGridShotToggle,
    setGridSingleTarget: (value: unknown) => {
      options.gridSingleTarget.value = value === null || value === undefined || value === '' ? null : Number(value)
    },
    generateGridPrompt: options.generateGridPrompt,
    startGridGen: options.startGridGen,
    setGridStep: (value: unknown) => { options.gridStep.value = Number(value) || 0 },
    focusGridCell: options.focusGridCell,
    handleGridAssignmentPageChange: options.handleGridAssignmentPageChange,
    handleGridAssignmentUpdate: options.handleGridAssignmentUpdate,
    doGridSplit: options.doGridSplit,
    handleGridDialogFinish: options.handleGridDialogFinish,
    batchVideos: options.batchVideos,
    genVid: options.genVid,
    retryVideoBilling: options.retryVideoBilling,
    restoreVideoFromHistory: options.restoreVideoFromHistory,
    openImageByPath: (path: string, title?: string) => {
      if (path) options.openImageViewer(options.resolveAssetUrl(path), title)
    },
  }

  return {
    productionPanelState,
    productionPanelHandlers,
  }
}
