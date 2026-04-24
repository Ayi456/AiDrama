import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import { gridAPI, imageAPI } from '~/composables/useApi'

interface UseEpisodeGridToolOptions {
  dramaId: number
  episodeNumber: number
  epId: ComputedRef<number>
  sbs: Ref<any[]>
  refresh: () => Promise<void>
}

export function useEpisodeGridTool(options: UseEpisodeGridToolOptions) {
  const gridDialog = ref(false)
  const gridStep = ref(0)
  const gridLayout = ref('3x3')
  const gridMode = ref('first_frame')
  const gridSelected = ref<number[]>([])
  const gridSingleTarget = ref<number | null>(null)
  const gridGenId = ref<number | null>(null)
  const gridImagePath = ref('')
  const gridStatusText = ref('')
  const gridActualLayout = ref({ rows: 3, cols: 3 })
  const gridRecoveredAt = ref('')
  const gridRecoveredMode = ref('')
  const gridPromptText = ref('')
  const gridCellPrompts = ref<any[]>([])
  const gridPromptSource = ref('')
  const gridPromptLoading = ref(false)
  const gridPromptStatus = ref('')
  const gridAssignmentsState = ref<Array<{ storyboard_id: number | null; frame_type: string }>>([])
  const gridActiveShotIds = ref<number[]>([])
  const gridHistory = ref<any[]>([])
  const showAllGridHistory = ref(false)
  const activeGridCell = ref(0)
  const gridAssignmentPage = ref(0)

  const gridStorageKey = computed(() => `aidrama:grid:${options.dramaId}:${options.epId.value || options.episodeNumber}`)

  const gridModes = [
    { id: 'first_frame', label: '首帧', desc: '每格=一个镜头的首帧' },
    { id: 'first_last', label: '首尾帧', desc: '每镜头占一行：左首帧，右尾帧' },
    { id: 'multi_ref', label: '多参考', desc: '所有格子=同一镜头的参考图' },
  ]

  const gridLayoutShape = computed(() => {
    const [rows, cols] = String(gridLayout.value || '3x3').split('x').map(Number)
    return {
      rows: rows || 3,
      cols: cols || 3,
    }
  })

  const gridTotalCells = computed(() => gridLayoutShape.value.rows * gridLayoutShape.value.cols)

  const gridCanStart = computed(() => {
    if (gridMode.value === 'multi_ref') return !!gridSingleTarget.value
    return gridSelected.value.length > 0
  })

  const gridSummary = computed(() => {
    if (gridMode.value === 'multi_ref') {
      const index = options.sbs.value.findIndex(s => s.id === gridSingleTarget.value) + 1
      return gridSingleTarget.value ? `${gridLayoutShape.value.rows}x${gridLayoutShape.value.cols} 参考图 -> 镜头 #${index}` : '请选择一个镜头'
    }
    if (!gridSelected.value.length) return '请选择镜头'
    const count = gridSelected.value.length
    const { rows, cols } = gridLayoutShape.value
    if (gridMode.value === 'first_last') {
      return `${count} 个镜头 -> ${rows}x${cols} 宫格（按首尾帧风格生成，切分后再手动分配）`
    }
    return `${count} 个镜头 -> ${rows}x${cols} 宫格（先生成宫格图，切分后再手动分配）`
  })

  function createGridAssignments() {
    return Array.from({ length: gridActualLayout.value.rows * gridActualLayout.value.cols }, () => ({
      storyboard_id: null,
      frame_type: 'first_frame',
    }))
  }

  const gridAssignments = computed(() => gridAssignmentsState.value)

  const gridAssignableShotIds = computed(() => {
    const assignedIds = [...new Set(gridAssignments.value.map(item => item?.storyboard_id).filter(Boolean))]
    const ids = Array.isArray(gridActiveShotIds.value) && gridActiveShotIds.value.length
      ? gridActiveShotIds.value
      : assignedIds.length
        ? assignedIds
        : gridMode.value === 'multi_ref'
          ? (gridSingleTarget.value ? [gridSingleTarget.value] : [])
          : gridSelected.value.length
            ? [...gridSelected.value]
            : options.sbs.value.map(s => s.id)
    return ids.filter(id => options.sbs.value.some(s => s.id === id))
  })

  const gridAssignmentShotOptions = computed(() => [
    { label: '未分配', value: null },
    ...gridAssignableShotIds.value.map((id) => {
      const index = options.sbs.value.findIndex(s => s.id === id) + 1
      const storyboard = options.sbs.value.find(s => s.id === id)
      return {
        label: `#${String(index).padStart(2, '0')} ${storyboard?.title || storyboard?.description || '镜头'}`,
        value: id,
      }
    }),
  ])

  const gridFrameTypeOptions = computed(() => [
    { label: '首帧', value: 'first_frame' },
    { label: '尾帧', value: 'last_frame' },
    { label: '参考图', value: 'reference' },
  ])

  const gridAssignedCount = computed(() => gridAssignments.value.filter(item => !!item.storyboard_id).length)

  const gridAssignmentPageSize = computed(() => {
    if (gridAssignments.value.length >= 25) return 8
    if (gridAssignments.value.length >= 16) return 10
    if (gridAssignments.value.length >= 9) return 9
    return Math.max(1, gridAssignments.value.length || 1)
  })

  const gridAssignmentTotalPages = computed(() => Math.max(1, Math.ceil(gridAssignments.value.length / gridAssignmentPageSize.value)))
  const gridAssignmentPageStart = computed(() => gridAssignmentPage.value * gridAssignmentPageSize.value)
  const gridAssignmentPageEnd = computed(() => Math.min(gridAssignments.value.length, gridAssignmentPageStart.value + gridAssignmentPageSize.value))
  const pagedGridAssignments = computed(() => {
    return gridAssignments.value
      .slice(gridAssignmentPageStart.value, gridAssignmentPageEnd.value)
      .map((assignment, offset) => ({
        assignment,
        index: gridAssignmentPageStart.value + offset,
      }))
  })

  function resetGridAssignments() {
    gridAssignmentsState.value = createGridAssignments()
    activeGridCell.value = 0
    gridAssignmentPage.value = 0
  }

  function gridCellLabel(assignment: any) {
    if (!assignment?.storyboard_id) return '未分配'
    const index = options.sbs.value.findIndex(s => s.id === assignment.storyboard_id) + 1
    const suffix = { first_frame: '首', last_frame: '尾', reference: '参' }[assignment.frame_type] || ''
    return `#${index}${suffix ? ` ${suffix}` : ''}`
  }

  function gridCellTitle(id: number | null) {
    if (!id) return '未分配'
    const index = options.sbs.value.findIndex(s => s.id === id) + 1
    const storyboard = options.sbs.value.find(s => s.id === id)
    return `#${String(index).padStart(2, '0')} ${storyboard?.title || storyboard?.description || '镜头'}`
  }

  function updateGridAssignment(index: number, field: 'storyboard_id' | 'frame_type', value: any) {
    const next = [...gridAssignmentsState.value]
    next[index] = { ...next[index], [field]: value }
    gridAssignmentsState.value = next
    activeGridCell.value = index
    if (gridImagePath.value) persistGridImagePath(gridImagePath.value)
  }

  function focusGridCell(index: number) {
    activeGridCell.value = index
    gridAssignmentPage.value = Math.floor(index / gridAssignmentPageSize.value)
  }

  const gridOverlayStyle = computed(() => {
    const { rows, cols } = gridActualLayout.value
    return { 'grid-template-columns': `repeat(${cols}, 1fr)`, 'grid-template-rows': `repeat(${rows}, 1fr)` }
  })

  const gridAutoLayout = computed(() => gridLayoutShape.value)

  const gridBlankStyle = computed(() => {
    const { rows, cols } = gridAutoLayout.value
    return { 'grid-template-columns': `repeat(${cols}, 1fr)`, 'grid-template-rows': `repeat(${rows}, 1fr)` }
  })

  function handleGridHistoryToggle() {
    showAllGridHistory.value = !showAllGridHistory.value
  }

  function handleGridModeChange(mode: string) {
    gridMode.value = mode
    gridSelected.value = []
    gridSingleTarget.value = null
    gridAssignmentsState.value = []
  }

  function handleGridShotToggle(payload: any) {
    const id = Number(payload?.id || 0)
    if (!id) return
    const next = new Set(gridSelected.value)
    if (payload?.checked) next.add(id)
    else next.delete(id)
    gridSelected.value = [...next]
  }

  function handleGridAssignmentPageChange(page: number) {
    const nextPage = Math.max(0, Number(page) || 0)
    gridAssignmentPage.value = Math.min(nextPage, Math.max(0, gridAssignmentTotalPages.value - 1))
  }

  function handleGridAssignmentUpdate(payload: any) {
    if (payload?.index === undefined || !payload?.field) return
    updateGridAssignment(payload.index, payload.field, payload.value)
  }

  async function handleGridDialogFinish() {
    gridDialog.value = false
    await options.refresh()
  }

  function gridSelectAll() {
    if (gridSelected.value.length === options.sbs.value.length) {
      gridSelected.value = []
      return
    }
    gridSelected.value = options.sbs.value.map(s => s.id)
  }

  function openGridTool() {
    gridStep.value = 0
    gridSelected.value = []
    gridSingleTarget.value = null
    gridActiveShotIds.value = []
    gridPromptText.value = ''
    gridCellPrompts.value = []
    gridPromptSource.value = ''
    gridPromptStatus.value = ''
    gridAssignmentsState.value = []
    gridDialog.value = true
  }

  function restoreGridState() {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(gridStorageKey.value)
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return { activeImagePath: raw, entries: { [raw]: {} } }
    }
  }

  function persistGridImagePath(value: string) {
    if (typeof window === 'undefined') return
    if (!value) {
      window.localStorage.removeItem(gridStorageKey.value)
      return
    }
    const current = restoreGridState() || {}
    const entries = current.entries || {}
    entries[value] = {
      generationId: gridGenId.value,
      layout: gridActualLayout.value,
      shotIds: gridActiveShotIds.value,
      assignments: gridAssignmentsState.value,
      recoveredAt: gridRecoveredAt.value,
      recoveredMode: gridRecoveredMode.value,
    }
    window.localStorage.setItem(gridStorageKey.value, JSON.stringify({
      activeImagePath: value,
      entries,
    }))
  }

  function applyGridState(imagePath: string, meta: any = {}) {
    gridImagePath.value = imagePath || ''
    gridGenId.value = meta.generationId || meta.id || null
    if (meta.layout?.rows && meta.layout?.cols) gridActualLayout.value = meta.layout
    gridActiveShotIds.value = Array.isArray(meta.shotIds) ? meta.shotIds : []
    gridAssignmentsState.value = Array.isArray(meta.assignments) ? meta.assignments : []
    gridRecoveredAt.value = meta.recoveredAt || meta.createdAtLabel || ''
    gridRecoveredMode.value = meta.recoveredMode || meta.modeLabel || ''
  }

  function selectGridHistory(item: any) {
    const cached = restoreGridState()
    const cachedEntry = cached?.entries?.[item.localPath] || {}
    applyGridState(item.localPath, {
      ...item,
      ...cachedEntry,
      generationId: cachedEntry.generationId || item.id,
      recoveredAt: cachedEntry.recoveredAt || item.createdAtLabel,
      recoveredMode: cachedEntry.recoveredMode || item.modeLabel,
    })
    if (!gridAssignmentsState.value.length) resetGridAssignments()
    persistGridImagePath(item.localPath)
  }

  function reopenGridPreview() {
    if (!gridImagePath.value) {
      openGridTool()
      return
    }
    gridDialog.value = true
    if (!gridAssignmentsState.value.length) resetGridAssignments()
    gridStep.value = 3
  }

  function parseGridLayoutFromFrameType(value: string) {
    const match = String(value || '').match(/grid_[^_]+_(\d+)x(\d+)$/)
    if (!match) return null
    return { rows: Number(match[1]) || 3, cols: Number(match[2]) || 3 }
  }

  function continueGridSplit() {
    if (!gridImagePath.value) {
      toast.warning('还没有可继续切割的宫格图')
      return
    }
    if (!gridAssignmentsState.value.length) resetGridAssignments()
    gridDialog.value = true
    gridStep.value = 3
  }

  function getGridPromptShotIds() {
    if (gridMode.value === 'multi_ref') return gridSingleTarget.value ? [gridSingleTarget.value] : []
    if (gridMode.value === 'first_last') return [...gridSelected.value]
    return gridSelected.value.slice(0, gridTotalCells.value)
  }

  async function generateGridPrompt() {
    if (!gridCanStart.value) {
      toast.warning('请先选择镜头')
      return
    }
    gridPromptLoading.value = true
    gridPromptStatus.value = '正在调用 AI 生成宫格提示词...'
    gridPromptText.value = ''
    gridCellPrompts.value = []
    gridPromptSource.value = ''

    try {
      const shotIds = getGridPromptShotIds()
      const { rows, cols } = gridAutoLayout.value
      const res = await gridAPI.prompt({
        storyboard_ids: shotIds,
        drama_id: options.dramaId,
        episode_id: options.epId.value,
        rows,
        cols,
        mode: gridMode.value,
      })

      gridPromptText.value = res?.grid_prompt || ''
      gridCellPrompts.value = Array.isArray(res?.cell_prompts) ? res.cell_prompts : []
      gridPromptSource.value = res?.source || ''

      if (gridPromptText.value) {
        resetGridAssignments()
        gridPromptStatus.value = gridPromptSource.value === 'agent' ? 'AI 提示词已生成' : '已使用模板提示词'
        gridStep.value = 1
        return
      }

      gridPromptStatus.value = ''
      toast.error('提示词生成失败')
    } catch (error: any) {
      gridPromptStatus.value = ''
      toast.error(error?.message || '生成提示词失败')
    } finally {
      gridPromptLoading.value = false
    }
  }

  async function startGridGen() {
    let rows: number
    let cols: number
    let ids: Array<number | null>

    if (gridMode.value === 'multi_ref') {
      rows = gridAutoLayout.value.rows
      cols = gridAutoLayout.value.cols
      ids = [gridSingleTarget.value]
    } else {
      rows = gridAutoLayout.value.rows
      cols = gridAutoLayout.value.cols
      ids = gridSelected.value.slice(0, gridTotalCells.value)
      if (gridMode.value === 'first_last') ids = [...gridSelected.value]
    }

    gridActiveShotIds.value = ids.filter(Boolean) as number[]
    gridActualLayout.value = { rows, cols }
    if (!gridAssignmentsState.value.length) resetGridAssignments()
    gridStep.value = 2
    gridStatusText.value = '提交生成请求...'

    try {
      const res = await gridAPI.generate({
        storyboard_ids: ids,
        drama_id: options.dramaId,
        rows,
        cols,
        mode: gridMode.value,
        custom_prompt: gridPromptText.value || undefined,
      })
      gridGenId.value = res.image_generation_id
      gridActualLayout.value = res.grid || { rows, cols }
      gridStatusText.value = '等待图片生成...'
      void pollGridStatus()
    } catch (error: any) {
      toast.error(error.message)
      gridStep.value = 0
    }
  }

  async function pollGridStatus() {
    for (let i = 0; i < 120; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000))
      try {
        const res = await gridAPI.status(gridGenId.value)
        gridStatusText.value = `状态: ${res.status}`
        if (res.status === 'completed' && res.local_path) {
          gridImagePath.value = res.local_path
          gridGenId.value = gridGenId.value || res.id || null
          persistGridImagePath(res.local_path)
          gridStep.value = 3
          return
        }
        if (res.status === 'failed') {
          toast.error(res.error_msg || '生成失败')
          gridStep.value = 0
          return
        }
      } catch {}
    }
    toast.error('生成超时')
    gridStep.value = 0
  }

  async function loadLatestGridImage() {
    try {
      const rows = await imageAPI.list({ drama_id: options.dramaId })
      const list = Array.isArray(rows) ? rows : []
      const grids = list
        .filter((row) => row?.status === 'completed' && String(row?.frame_type || row?.frameType || '').startsWith('grid_') && (row?.local_path || row?.localPath))
        .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))
        .map((row) => {
          const frameType = String(row?.frame_type || row?.frameType || '')
          const parsedLayout = parseGridLayoutFromFrameType(frameType) || { rows: 3, cols: 3 }
          return {
            id: row.id,
            localPath: row?.local_path || row?.localPath || '',
            layout: parsedLayout,
            modeLabel: frameType.replace(/^grid_/, '').replace(/_/g, ' · '),
            createdAtLabel: row?.created_at || row?.createdAt || '',
          }
        })

      gridHistory.value = grids

      const cached = restoreGridState()
      const preferredPath = cached?.activeImagePath && grids.some(item => item.localPath === cached.activeImagePath)
        ? cached.activeImagePath
        : grids[0]?.localPath
      const current = grids.find(item => item.localPath === preferredPath)
      if (current) {
        const cachedEntry = cached?.entries?.[current.localPath] || {}
        applyGridState(current.localPath, {
          ...current,
          ...cachedEntry,
          generationId: cachedEntry.generationId || current.id,
          recoveredAt: cachedEntry.recoveredAt || current.createdAtLabel,
          recoveredMode: cachedEntry.recoveredMode || current.modeLabel,
        })
        if (!gridAssignmentsState.value.length) resetGridAssignments()
        persistGridImagePath(current.localPath)
        return
      }
    } catch {}

    const cached = restoreGridState()
    if (cached?.activeImagePath) {
      const cachedEntry = cached?.entries?.[cached.activeImagePath] || {}
      applyGridState(cached.activeImagePath, {
        ...cachedEntry,
        recoveredAt: cachedEntry.recoveredAt || '',
        recoveredMode: cachedEntry.recoveredMode || '',
      })
    }
  }

  async function doGridSplit() {
    const { rows, cols } = gridActualLayout.value
    try {
      const assignments = gridAssignments.value
        .filter(item => !!item.storyboard_id)
        .map(item => ({ storyboard_id: item.storyboard_id, frame_type: item.frame_type }))
      if (!assignments.length) {
        toast.warning('请至少分配一个格子')
        return
      }
      await gridAPI.split({ image_generation_id: gridGenId.value, rows, cols, assignments })
      persistGridImagePath(gridImagePath.value)
      gridStep.value = 4
      toast.success('切分分配完成')
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  return {
    gridDialog,
    gridStep,
    gridLayout,
    gridMode,
    gridSelected,
    gridSingleTarget,
    gridGenId,
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
    gridAssignmentsState,
    gridActiveShotIds,
    gridHistory,
    showAllGridHistory,
    activeGridCell,
    gridAssignmentPage,
    gridStorageKey,
    gridModes,
    gridLayoutShape,
    gridTotalCells,
    gridCanStart,
    gridSummary,
    gridAssignments,
    gridAssignableShotIds,
    gridAssignmentShotOptions,
    gridFrameTypeOptions,
    gridAssignedCount,
    gridAssignmentPageSize,
    gridAssignmentTotalPages,
    gridAssignmentPageStart,
    gridAssignmentPageEnd,
    pagedGridAssignments,
    gridOverlayStyle,
    gridAutoLayout,
    gridBlankStyle,
    resetGridAssignments,
    gridCellLabel,
    gridCellTitle,
    updateGridAssignment,
    focusGridCell,
    handleGridHistoryToggle,
    handleGridModeChange,
    handleGridShotToggle,
    handleGridAssignmentPageChange,
    handleGridAssignmentUpdate,
    handleGridDialogFinish,
    gridSelectAll,
    openGridTool,
    persistGridImagePath,
    restoreGridState,
    applyGridState,
    selectGridHistory,
    reopenGridPreview,
    parseGridLayoutFromFrameType,
    continueGridSplit,
    getGridPromptShotIds,
    generateGridPrompt,
    startGridGen,
    pollGridStatus,
    loadLatestGridImage,
    doGridSplit,
  }
}
