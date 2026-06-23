import assert from 'node:assert/strict'

import {
  parseDirectExtractorResponse,
  runDirectAgentIfNeeded,
  shouldUseDirectAgentMode,
  type DirectChatCompletionInput,
} from '../direct-mode.js'

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

const mimoConfig = {
  provider: 'openai',
  baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
  apiKey: 'key',
  model: 'mimo-v2.5-pro',
  settings: {},
}

await runTest('shouldUseDirectAgentMode routes MiMo script agents to direct mode', () => {
  assert.equal(shouldUseDirectAgentMode('script_rewriter', mimoConfig), true)
  assert.equal(shouldUseDirectAgentMode('extractor', mimoConfig), true)
})

await runTest('shouldUseDirectAgentMode keeps MinMax tool-call agents unchanged', () => {
  const minmaxConfig = {
    provider: 'minimax',
    baseUrl: 'https://api.minimax.chat',
    apiKey: 'key',
    model: 'MinMax-M2.7',
    settings: {},
  }
  assert.equal(shouldUseDirectAgentMode('extractor', minmaxConfig), false)
})

await runTest('parseDirectExtractorResponse reads strict JSON from fenced model output', () => {
  const parsed = parseDirectExtractorResponse('```json\n{"characters":[{"name":"林夏"}],"scenes":[{"location":"天台","time":"夜"}]}\n```')
  assert.deepEqual(parsed, {
    characters: [{
      name: '林夏',
      role: '',
      description: '',
      appearance: '',
      personality: '',
    }],
    scenes: [{
      location: '天台',
      time: '夜',
      prompt: '',
    }],
  })
})

await runTest('runDirectAgentIfNeeded rewrites MiMo scripts without tool-call payloads', async () => {
  let completionInput: DirectChatCompletionInput | null = null
  let savedScript = ''

  const result = await runDirectAgentIfNeeded('script_rewriter', {
    dramaId: 3,
    episodeId: 7,
    message: 'rewrite',
  }, {
    getTextConfig: async () => mimoConfig,
    completeText: async (input) => {
      completionInput = input
      return '# S1 | 内景 · 客厅 | 夜\n林夏：你好'
    },
    loadEpisodeContent: async () => '原始小说内容',
    saveEpisodeScript: async (_episodeId, content) => {
      savedScript = content
      return { message: 'Script saved', word_count: content.length }
    },
  })

  assert.equal(result?.agentMode, 'direct')
  assert.equal(savedScript, '# S1 | 内景 · 客厅 | 夜\n林夏：你好')
  assert.ok(completionInput)
  const input = completionInput as DirectChatCompletionInput
  assert.equal(input.body.tools, undefined)
  assert.equal(input.body.tool_choice, undefined)
})

await runTest('runDirectAgentIfNeeded extracts MiMo characters and scenes without tool-call payloads', async () => {
  let completionInput: DirectChatCompletionInput | null = null
  let savedCharacterNames: string[] = []
  let savedSceneLocations: string[] = []
  let characterSaveReplaceExisting: unknown = null
  let sceneSaveReplaceExisting: unknown = null

  const result = await runDirectAgentIfNeeded('extractor', {
    dramaId: 3,
    episodeId: 7,
    message: 'extract',
    replaceExisting: true,
  }, {
    getTextConfig: async () => mimoConfig,
    completeText: async (input) => {
      completionInput = input
      return JSON.stringify({
        characters: [{ name: '林夏', role: '女主' }],
        scenes: [{ location: '天台', time: '夜', prompt: '冷色月光下的城市天台' }],
      })
    },
    loadEpisodeContent: async () => '# S1 | 外景 · 天台 | 夜',
    loadExistingCharacters: async () => [{ id: 1, name: '林夏' }],
    loadExistingScenes: async () => [],
    saveCharacters: async (_episodeId, _dramaId, characters, options) => {
      savedCharacterNames = characters.map(character => character.name)
      characterSaveReplaceExisting = options?.replaceExisting
      return { message: 'Characters saved', created: 0, merged: characters.length }
    },
    saveScenes: async (_episodeId, _dramaId, scenes, options) => {
      savedSceneLocations = scenes.map(scene => scene.location)
      sceneSaveReplaceExisting = options?.replaceExisting
      return { message: 'Scenes saved', created: scenes.length, reused: 0 }
    },
  })

  assert.equal(result?.agentMode, 'direct')
  assert.deepEqual(savedCharacterNames, ['林夏'])
  assert.deepEqual(savedSceneLocations, ['天台'])
  assert.equal(characterSaveReplaceExisting, true)
  assert.equal(sceneSaveReplaceExisting, true)
  assert.ok(completionInput)
  const input = completionInput as DirectChatCompletionInput
  assert.equal(input.body.tools, undefined)
  assert.equal(input.body.tool_choice, undefined)
  assert.match(input.body.messages.map(message => message.content).join('\n'), /complete reusable baseline costume\/design/)
  assert.match(input.body.messages.map(message => message.content).join('\n'), /Do not write single-scene expression/)
})

await runTest('runDirectAgentIfNeeded returns null for non-MiMo providers', async () => {
  let completed = false
  const result = await runDirectAgentIfNeeded('extractor', {
    dramaId: 3,
    episodeId: 7,
    message: 'extract',
  }, {
    getTextConfig: async () => ({
      provider: 'minimax',
      baseUrl: 'https://api.minimax.chat',
      apiKey: 'key',
      model: 'MinMax-M2.7',
      settings: {},
    }),
    completeText: async () => {
      completed = true
      return '{}'
    },
  })

  assert.equal(result, null)
  assert.equal(completed, false)
})
