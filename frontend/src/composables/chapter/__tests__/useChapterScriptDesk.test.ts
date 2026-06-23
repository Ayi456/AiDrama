import assert from 'node:assert/strict'

import { computed, ref } from 'vue'

import { useChapterScriptDesk } from '../useChapterScriptDesk.ts'

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

await runTest('script desk keeps local buffers synced and saves chapter text', async () => {
  const episode = ref({ id: 11, content: 'raw source', script_content: 'script source' })
  const updates: Array<{ id: number; payload: Record<string, unknown> }> = []
  const desk = useChapterScriptDesk({
    dramaId: 3,
    epId: computed(() => episode.value.id),
    episode,
    scriptStep: ref(0),
    videoConfigs: ref([]),
    lockedVideoConfigId: computed(() => null),
    runAgent: () => undefined,
    refresh: async () => undefined,
    updateChapter: async (id, payload) => {
      updates.push({ id, payload })
    },
  })

  assert.equal(desk.localRaw.value, 'raw source')
  assert.equal(desk.localScript.value, 'script source')
  assert.equal(desk.rawLen.value, 9)
  assert.equal(desk.scriptLen.value, 12)

  desk.localRaw.value = 'new raw'
  await desk.saveRaw()
  desk.localScript.value = 'new script'
  await desk.saveScr()

  assert.deepEqual(updates, [
    { id: 11, payload: { content: 'new raw' } },
    { id: 11, payload: { script_content: 'new script' } },
  ])
  assert.equal(episode.value.content, 'new raw')
  assert.equal(episode.value.script_content, 'new script')
})

await runTest('script desk skip rewrite uses raw content and advances to extraction', async () => {
  const scriptStep = ref(1)
  const successes: string[] = []
  const warnings: string[] = []
  const episode = ref({ id: 12, content: '', script_content: '' })
  const desk = useChapterScriptDesk({
    dramaId: 3,
    epId: computed(() => episode.value.id),
    episode,
    scriptStep,
    videoConfigs: ref([]),
    lockedVideoConfigId: computed(() => null),
    runAgent: () => undefined,
    refresh: async () => undefined,
    notifySuccess: message => successes.push(message),
    notifyWarning: message => warnings.push(message),
    updateChapter: async () => undefined,
  })

  desk.skipRewrite()
  assert.equal(scriptStep.value, 1)
  assert.equal(warnings.length, 1)

  desk.localRaw.value = 'usable raw'
  desk.skipRewrite()

  assert.equal(desk.localScript.value, 'usable raw')
  assert.equal(episode.value.script_content, 'usable raw')
  assert.equal(scriptStep.value, 2)
  assert.equal(successes.length, 1)
})

await runTest('script desk dispatches rewrite, extraction, and breakdown agents', async () => {
  const episode = ref({ id: 13, content: 'raw', script_content: 'script' })
  const calls: Array<{
    type: string
    prompt: string
    dramaId: number
    episodeId: number
    options?: Record<string, unknown>
  }> = []
  const desk = useChapterScriptDesk({
    dramaId: 5,
    epId: computed(() => episode.value.id),
    episode,
    scriptStep: ref(0),
    videoConfigs: ref([{ id: 8, name: 'Video Fast', provider: 'vidu' }]),
    lockedVideoConfigId: computed(() => 8),
    runAgent: (type, prompt, dramaId, episodeId, _refresh, options) => {
      calls.push({ type, prompt, dramaId, episodeId, options })
    },
    refresh: async () => undefined,
    updateChapter: async () => undefined,
  })

  desk.doRewrite()
  desk.doExtract()
  desk.doBreakdown()

  assert.deepEqual(calls.map(call => call.type), ['script_rewriter', 'extractor', 'storyboard_breaker'])
  assert.deepEqual(calls.map(call => call.dramaId), [5, 5, 5])
  assert.deepEqual(calls.map(call => call.episodeId), [13, 13, 13])
  assert.deepEqual(calls[1]?.options, {
    replace_existing: true,
    use_default_prompt: true,
  })
  assert.match(calls[1]?.prompt || '', /替换当前集/)
  assert.match(calls[2]?.prompt || '', /Video Fast \(vidu\)/)
})

await runTest('script desk notifies automation progress after one-click start succeeds', async () => {
  const episode = ref({ id: 14, content: 'raw', script_content: 'script', automation_status: 'idle' })
  const starts: number[] = []
  const started: number[] = []
  let refreshes = 0

  const desk = useChapterScriptDesk({
    dramaId: 5,
    epId: computed(() => episode.value.id),
    episode,
    scriptStep: ref(0),
    videoConfigs: ref([]),
    lockedVideoConfigId: computed(() => null),
    runAgent: () => undefined,
    refresh: async () => { refreshes++ },
    updateChapter: async () => undefined,
    startAutomationRequest: async (id) => {
      starts.push(id)
      return { status: 'running' }
    },
    onAutomationStarted: (id) => {
      started.push(id)
    },
  })

  await desk.startAutomation()

  assert.deepEqual(starts, [14])
  assert.deepEqual(started, [14])
  assert.equal(refreshes, 1)
  assert.equal(desk.automationStarting.value, false)
})

await runTest('script desk refreshes automation progress when start reports an existing run', async () => {
  const episode = ref({ id: 15, content: 'raw', script_content: 'script', automation_status: 'idle' })
  const started: number[] = []
  let refreshes = 0

  const desk = useChapterScriptDesk({
    dramaId: 5,
    epId: computed(() => episode.value.id),
    episode,
    scriptStep: ref(0),
    videoConfigs: ref([]),
    lockedVideoConfigId: computed(() => null),
    runAgent: () => undefined,
    refresh: async () => { refreshes++ },
    updateChapter: async () => undefined,
    startAutomationRequest: async () => {
      throw new Error('409 already running')
    },
    onAutomationStarted: (id) => {
      started.push(id)
    },
  })

  await desk.startAutomation()

  assert.deepEqual(started, [15])
  assert.equal(refreshes, 1)
  assert.equal(desk.automationStarting.value, false)
})
