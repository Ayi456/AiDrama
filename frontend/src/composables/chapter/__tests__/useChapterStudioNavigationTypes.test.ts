import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { computed, ref } from 'vue'

import { useChapterStudioNavigation } from '../useChapterStudioNavigation.ts'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('studio navigation avoids loose any types', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../useChapterStudioNavigation.ts', import.meta.url)),
    'utf8',
  )

  assert.equal(/\bany\b/.test(source), false)
})

function createNavigationState() {
  const scriptStep = ref(2)
  const savedRaw: string[] = []
  const savedScript: string[] = []
  const navigation = useChapterStudioNavigation({
    scriptStep,
    rawContent: computed(() => 'raw'),
    scriptContent: computed(() => 'script'),
    localRaw: ref('raw draft'),
    localScript: ref('script draft'),
    chars: ref([{ id: 1, name: '林晚', image_url: 'lin.png' }]),
    scenes: ref([{ id: 2, location: '公寓电梯', image_url: 'elevator.png' }]),
    sbs: ref([]),
    visualChars: computed(() => [{ id: 1, name: '林晚', image_url: 'lin.png' }]),
    mergeClipCount: computed(() => 0),
    mergeUrl: computed(() => ''),
    saveRaw: () => savedRaw.push('saved'),
    saveScr: () => savedScript.push('saved'),
  })
  return { navigation, scriptStep, savedRaw, savedScript }
}

runTest('studio navigation moves storyboard after character and scene assets', () => {
  const { navigation } = createNavigationState()

  assert.deepEqual(
    navigation.sidebarSections.value.map(section => ({
      label: section.label,
      items: section.items.map(item => item.key),
    })),
    [
      { label: '剧本', items: ['script:raw', 'script:rewrite', 'script:extract'] },
      { label: '制作', items: ['prod:chars', 'prod:scenes', 'prod:storyboard', 'prod:shots', 'prod:videos'] },
      { label: '导出', items: ['export:merge'] },
    ],
  )
  assert.deepEqual(navigation.prodTabDefs.value.map(tab => tab.id), ['chars', 'scenes', 'storyboard', 'shots', 'videos'])
  assert.equal(navigation.pipelineTotal.value, 9)
  assert.equal(navigation.pipelineProgress.value, 5)
})

runTest('studio navigation enters production assets after extraction and redirects legacy storyboard links', () => {
  const { navigation, scriptStep } = createNavigationState()

  assert.equal(navigation.nextStepLabel.value, '进入制作')
  assert.equal(navigation.canGoNext.value, true)

  navigation.goNextStep()
  assert.equal(scriptStep.value, 2)
  assert.equal(navigation.panel.value, 'production')
  assert.equal(navigation.prodTab.value, 'chars')
  assert.equal(navigation.activeSubStepKey.value, 'prod:chars')

  navigation.goSubStep('prod:storyboard')
  assert.equal(navigation.panel.value, 'production')
  assert.equal(navigation.prodTab.value, 'storyboard')
  assert.equal(navigation.activeSubStepKey.value, 'prod:storyboard')

  navigation.goSubStep('script:storyboard')
  assert.equal(navigation.panel.value, 'production')
  assert.equal(navigation.prodTab.value, 'storyboard')
  assert.equal(navigation.activeSubStepKey.value, 'prod:storyboard')
})
