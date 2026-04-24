import { computed, ref, type ComputedRef, type Ref } from 'vue'
import {
  Users, MapPin, Video, ImageIcon, Layers, FileText, FolderKanban, Clapperboard, Download,
} from 'lucide-vue-next'

interface UseEpisodeStudioNavigationOptions {
  rawContent: ComputedRef<string>
  scriptContent: ComputedRef<string>
  localRaw: Ref<string>
  localScript: Ref<string>
  chars: Ref<any[]>
  scenes: Ref<any[]>
  sbs: Ref<any[]>
  visualChars: ComputedRef<any[]>
  composedCount: ComputedRef<number>
  mergeUrl: ComputedRef<string | null>
  saveRaw: () => void
  saveScr: () => void
}

export function useEpisodeStudioNavigation(options: UseEpisodeStudioNavigationOptions) {
  const panel = ref('script')
  const scriptStep = ref(0)
  const prodTab = ref('chars')

  const charImgCount = computed(() => options.visualChars.value.filter(c => c.image_url || c.imageUrl).length)
  const sceneImgCount = computed(() => options.scenes.value.filter(s => s.image_url || s.imageUrl).length)
  const shotImgCount = computed(() => options.sbs.value.filter(s => s.first_frame_image || s.firstFrameImage || s.last_frame_image || s.lastFrameImage || s.composed_image || s.composedImage).length)
  const shotVidCount = computed(() => options.sbs.value.filter(s => s.video_url || s.videoUrl).length)
  const visualCharTotal = computed(() => options.visualChars.value.length)

  function prodStepDone(id: string) {
    if (id === 'chars') return !visualCharTotal.value || charImgCount.value === visualCharTotal.value
    if (id === 'scenes') return !!options.scenes.value.length && sceneImgCount.value === options.scenes.value.length
    if (id === 'shots') return !!options.sbs.value.length && shotImgCount.value === options.sbs.value.length
    if (id === 'videos') return !!options.sbs.value.length && shotVidCount.value === options.sbs.value.length
    if (id === 'compose') return !!options.sbs.value.length && options.composedCount.value === options.sbs.value.length
    return false
  }

  const prodTabDefs = computed(() => [
    { id: 'chars', label: '角色形象', icon: Users, badge: visualCharTotal.value ? `${charImgCount.value}/${visualCharTotal.value}` : '' },
    { id: 'scenes', label: '场景图片', icon: MapPin, badge: sceneImgCount.value ? `${sceneImgCount.value}/${options.scenes.value.length}` : '' },
    { id: 'shots', label: '镜头图片', icon: ImageIcon, badge: shotImgCount.value ? `${shotImgCount.value}/${options.sbs.value.length}` : '' },
    { id: 'videos', label: '视频生成', icon: Video, badge: shotVidCount.value ? `${shotVidCount.value}/${options.sbs.value.length}` : '' },
    { id: 'compose', label: '视频合成', icon: Layers, badge: options.composedCount.value ? `${options.composedCount.value}/${options.sbs.value.length}` : '' },
  ])

  const prodTabIdx = computed({
    get: () => prodTabDefs.value.findIndex(t => t.id === prodTab.value),
    set: (value: number) => {
      prodTab.value = prodTabDefs.value[value]?.id || 'chars'
    },
  })

  const mainStageDefs = [
    { id: 'script', label: '剧本', desc: '内容改写与整理', icon: FileText },
    { id: 'assets', label: '资产', desc: '角色与场景', icon: FolderKanban },
    { id: 'storyboard', label: '分镜', desc: '镜头制作与合成', icon: Clapperboard },
    { id: 'export', label: '导出', desc: '拼接与成片输出', icon: Download },
  ]

  const canExport = computed(() => !!options.sbs.value.length && options.composedCount.value === options.sbs.value.length)

  const sidebarSections = computed(() => ([
    {
      id: 'script',
      label: '剧本',
      items: [
        { key: 'script:raw', label: '原始内容', desc: '', icon: FileText, done: !!options.rawContent.value },
        { key: 'script:rewrite', label: 'AI 改写', desc: '', icon: FileText, done: !!options.scriptContent.value },
        { key: 'script:extract', label: '提取', desc: '', icon: Users, done: !!options.chars.value.length },
        { key: 'script:storyboard', label: '分镜', desc: '', icon: Clapperboard, done: !!options.sbs.value.length },
      ],
    },
    {
      id: 'production',
      label: '制作',
      items: [
        { key: 'prod:chars', label: '角色形象', desc: '', icon: Users, done: prodStepDone('chars') },
        { key: 'prod:scenes', label: '场景图片', desc: '', icon: MapPin, done: prodStepDone('scenes') },
        { key: 'prod:shots', label: '镜头图片', desc: '', icon: ImageIcon, done: prodStepDone('shots') },
        { key: 'prod:videos', label: '视频生成', desc: '', icon: Video, done: prodStepDone('videos') },
        { key: 'prod:compose', label: '视频合成', desc: '', icon: Layers, done: prodStepDone('compose') },
      ],
    },
    {
      id: 'export',
      label: '导出',
      items: [
        { key: 'export:merge', label: '拼接导出', desc: '', icon: Download, done: !!options.mergeUrl.value },
      ],
    },
  ]))

  const activeMainStage = computed(() => {
    if (panel.value === 'export') return 'export'
    if (panel.value === 'production') return ['chars', 'scenes'].includes(prodTab.value) ? 'assets' : 'storyboard'
    if (scriptStep.value <= 1) return 'script'
    if (scriptStep.value <= 2) return 'assets'
    return 'storyboard'
  })

  function mainStageDone(stageId: string) {
    if (stageId === 'script') return !!options.scriptContent.value
    if (stageId === 'assets') {
      const charsReady = !!options.chars.value.length
      const charImagesReady = !visualCharTotal.value || charImgCount.value === visualCharTotal.value
      const sceneImagesReady = !options.scenes.value.length || sceneImgCount.value === options.scenes.value.length
      return charsReady && charImagesReady && sceneImagesReady
    }
    if (stageId === 'storyboard') {
      if (!options.sbs.value.length) return false
      return shotImgCount.value === options.sbs.value.length
        && shotVidCount.value === options.sbs.value.length
        && options.composedCount.value === options.sbs.value.length
    }
    if (stageId === 'export') return !!options.mergeUrl.value
    return false
  }

  function goMainStage(stageId: string) {
    if (stageId === 'script') {
      panel.value = 'script'
      scriptStep.value = Math.min(scriptStep.value, 1)
      return
    }
    if (stageId === 'assets') {
      const hasAssetWorkspace = !!visualCharTotal.value || !!options.scenes.value.length
      const hasPendingAssetGeneration = (visualCharTotal.value && charImgCount.value < visualCharTotal.value)
        || (options.scenes.value.length && sceneImgCount.value < options.scenes.value.length)
      if (panel.value === 'production' || hasPendingAssetGeneration || hasAssetWorkspace) {
        panel.value = 'production'
        prodTab.value = ['chars', 'scenes'].includes(prodTab.value) ? prodTab.value : 'chars'
        return
      }
      panel.value = 'script'
      scriptStep.value = options.chars.value.length ? 3 : 2
      return
    }
    if (stageId === 'storyboard') {
      if (panel.value === 'production') {
        prodTab.value = ['shots', 'videos', 'compose'].includes(prodTab.value) ? prodTab.value : 'shots'
        return
      }
      panel.value = 'script'
      scriptStep.value = 3
      return
    }
    panel.value = 'export'
  }

  const activeSubSteps = computed(() => {
    if (activeMainStage.value === 'script') {
      return [
        { key: 'script:raw', label: '原始内容', done: !!options.rawContent.value },
        { key: 'script:rewrite', label: 'AI 改写', done: !!options.scriptContent.value },
      ]
    }
    if (activeMainStage.value === 'assets') {
      return [
        { key: 'script:extract', label: '提取角色场景', done: !!options.chars.value.length },
        { key: 'prod:chars', label: '角色形象', done: !visualCharTotal.value || charImgCount.value === visualCharTotal.value },
        { key: 'prod:scenes', label: '场景图片', done: !options.scenes.value.length || sceneImgCount.value === options.scenes.value.length },
      ]
    }
    if (activeMainStage.value === 'storyboard') {
      return [
        { key: 'script:storyboard', label: '分镜拆解', done: !!options.sbs.value.length },
        { key: 'prod:shots', label: '镜头图片', done: !!options.sbs.value.length && shotImgCount.value === options.sbs.value.length },
        { key: 'prod:videos', label: '视频生成', done: !!options.sbs.value.length && shotVidCount.value === options.sbs.value.length },
        { key: 'prod:compose', label: '视频合成', done: !!options.sbs.value.length && options.composedCount.value === options.sbs.value.length },
      ]
    }
    return [{ key: 'export:merge', label: '拼接导出', done: !!options.mergeUrl.value }]
  })

  const activeSubStepKey = computed(() => {
    if (panel.value === 'script') {
      if (scriptStep.value === 0) return 'script:raw'
      if (scriptStep.value === 1) return 'script:rewrite'
      if (scriptStep.value === 2) return 'script:extract'
      return 'script:storyboard'
    }
    if (panel.value === 'production') return `prod:${prodTab.value}`
    return 'export:merge'
  })

  const sidebarJumpSteps = computed(() => {
    const section = sidebarSections.value.find(item => item.items.some(step => step.key === activeSubStepKey.value))
    return section?.items || []
  })

  const bubbleSteps = computed(() => {
    if (panel.value === 'script') {
      return [
        { key: 'script:raw', label: '原始内容', done: !!options.rawContent.value },
        { key: 'script:rewrite', label: 'AI 改写', done: !!options.scriptContent.value },
        { key: 'script:extract', label: '提取', done: !!options.chars.value.length },
        { key: 'script:storyboard', label: '分镜', done: !!options.sbs.value.length },
      ]
    }
    if (panel.value === 'production') {
      return prodTabDefs.value.map(step => ({
        key: `prod:${step.id}`,
        label: step.label,
        done: prodStepDone(step.id),
      }))
    }
    return []
  })

  const activeBubbleKey = computed(() => {
    if (panel.value === 'script') return activeSubStepKey.value
    if (panel.value === 'production') return `prod:${prodTab.value}`
    return ''
  })

  const showBottomBubble = computed(() => panel.value === 'script' || panel.value === 'production')

  function goSubStep(key: string) {
    if (key.startsWith('script:')) {
      panel.value = 'script'
      const stepMap: Record<string, number> = {
        'script:raw': 0,
        'script:rewrite': 1,
        'script:extract': 2,
        'script:storyboard': 3,
      }
      scriptStep.value = stepMap[key] ?? 0
      return
    }
    if (key.startsWith('prod:')) {
      panel.value = 'production'
      prodTab.value = key.replace('prod:', '')
      return
    }
    panel.value = 'export'
  }

  const stepLabels = ['原始内容', 'AI 改写', '提取', '分镜']
  const prevStepLabel = computed(() => scriptStep.value > 0 ? stepLabels[scriptStep.value - 1] : '')
  const nextStepLabel = computed(() => {
    if (scriptStep.value === 3) return '进入制作'
    return stepLabels[scriptStep.value + 1] || ''
  })

  const canGoNext = computed(() => {
    if (scriptStep.value === 0) return !!options.localRaw.value.trim()
    if (scriptStep.value === 1) return !!options.localScript.value.trim() || !!options.scriptContent.value
    if (scriptStep.value === 2) return options.chars.value.length > 0
    if (scriptStep.value === 3) return options.sbs.value.length > 0
    return false
  })

  function goPrevStep() {
    if (scriptStep.value > 0) scriptStep.value--
  }

  function goNextStep() {
    if (scriptStep.value === 0 && options.localRaw.value.trim()) options.saveRaw()
    if (scriptStep.value === 1 && options.localScript.value.trim()) options.saveScr()
    if (scriptStep.value === 3) {
      panel.value = 'production'
      return
    }
    if (canGoNext.value) scriptStep.value++
  }

  function goNextProd() {
    if (prodTabIdx.value < prodTabDefs.value.length - 1) {
      prodTabIdx.value++
      return
    }
    panel.value = 'export'
  }

  function syncScriptStep() {
    const hasContent = !!options.rawContent.value
    const hasScript = !!options.scriptContent.value
    const hasStoryboards = options.sbs.value.length > 0
    if (hasStoryboards) {
      scriptStep.value = 3
      return
    }
    if (hasScript && options.chars.value.length) {
      scriptStep.value = 2
      return
    }
    if (hasScript || hasContent) {
      scriptStep.value = 1
      return
    }
    scriptStep.value = 0
  }

  const pipelineProgress = computed(() => {
    let progress = 0
    if (options.rawContent.value) progress++
    if (options.scriptContent.value) progress++
    if (options.chars.value.length) progress++
    if (options.sbs.value.length) progress++
    if (options.sbs.value.some(s => s.composed_image || s.composedImage)) progress++
    if (options.sbs.value.some(s => s.video_url || s.videoUrl)) progress++
    if (options.sbs.value.length && options.composedCount.value === options.sbs.value.length) progress++
    if (options.mergeUrl.value) progress++
    return progress
  })

  const currentStageLabel = computed(() => {
    if (panel.value === 'script') return `剧本阶段 · ${stepLabels[scriptStep.value]}`
    if (panel.value === 'production') return `制作阶段 · ${prodTabDefs.value[prodTabIdx.value]?.label || '制作'}`
    return options.mergeUrl.value ? '导出阶段 · 成片已生成' : '导出阶段 · 等待拼接'
  })

  const currentMainStageLabel = computed(() => {
    const current = mainStageDefs.find(stage => stage.id === activeMainStage.value)
    return current?.label || '工作台'
  })

  const currentSubStageLabel = computed(() => {
    const current = activeSubSteps.value.find(step => step.key === activeSubStepKey.value)
    return current?.label || currentStageLabel.value
  })

  return {
    panel,
    scriptStep,
    prodTab,
    prodTabIdx,
    prodTabDefs,
    mainStageDefs,
    sidebarSections,
    activeMainStage,
    mainStageDone,
    goMainStage,
    activeSubSteps,
    activeSubStepKey,
    sidebarJumpSteps,
    bubbleSteps,
    activeBubbleKey,
    showBottomBubble,
    goSubStep,
    charImgCount,
    sceneImgCount,
    shotImgCount,
    shotVidCount,
    visualCharTotal,
    canExport,
    prodStepDone,
    goNextProd,
    stepLabels,
    prevStepLabel,
    nextStepLabel,
    canGoNext,
    goPrevStep,
    goNextStep,
    syncScriptStep,
    pipelineProgress,
    currentStageLabel,
    currentMainStageLabel,
    currentSubStageLabel,
  }
}
