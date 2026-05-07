import assert from 'node:assert/strict'

import {
  mergeAgentInstructions,
  resolveAgentModelName,
  resolveAgentTools,
  type CreateAgentOptions,
} from '../agent-factory-helpers.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('resolveAgentModelName prefers non-empty db config model and falls back otherwise', () => {
  assert.equal(resolveAgentModelName({ model: 'claude-3-7' }, 'gpt-4.1'), 'claude-3-7')
  assert.equal(resolveAgentModelName({ model: '   ' }, 'gpt-4.1'), 'gpt-4.1')
  assert.equal(resolveAgentModelName(null, 'gpt-4.1'), 'gpt-4.1')
})

runTest('mergeAgentInstructions appends non-empty skill instructions with a blank line', () => {
  assert.equal(
    mergeAgentInstructions('base instructions', '## Skill\nextra guidance'),
    'base instructions\n\n## Skill\nextra guidance',
  )
})

runTest('mergeAgentInstructions ignores empty skill instructions', () => {
  assert.equal(mergeAgentInstructions('base instructions', ''), 'base instructions')
  assert.equal(mergeAgentInstructions('base instructions', '   '), 'base instructions')
})

runTest('resolveAgentTools dispatches storyboard options to the storyboard factory', () => {
  const calls: Array<{ name: string; args: unknown[] }> = []
  const storyboardOptions: CreateAgentOptions['storyboard'] = {
    appendMode: true,
    clearBeforeAppend: false,
  }

  const tools = resolveAgentTools(
    'storyboard_breaker',
    12,
    34,
    { storyboard: storyboardOptions },
    {
      script_rewriter: (...args: unknown[]) => {
        calls.push({ name: 'script_rewriter', args })
        return { readEpisodeScript: true }
      },
      extractor: (...args: unknown[]) => {
        calls.push({ name: 'extractor', args })
        return { readExistingCharacters: true }
      },
      storyboard_breaker: (...args: unknown[]) => {
        calls.push({ name: 'storyboard_breaker', args })
        return { saveStoryboards: true }
      },
      grid_prompt_generator: (...args: unknown[]) => {
        calls.push({ name: 'grid_prompt_generator', args })
        return { generateGridPrompt: true }
      },
    },
  )

  assert.deepEqual(tools, { saveStoryboards: true })
  assert.deepEqual(calls, [
    { name: 'storyboard_breaker', args: [12, 34, storyboardOptions] },
  ])
})

runTest('resolveAgentTools returns null for unsupported agent types', () => {
  const tools = resolveAgentTools(
    'unknown_agent',
    1,
    2,
    {},
    {
      script_rewriter: () => ({ readEpisodeScript: true }),
      extractor: () => ({ readExistingCharacters: true }),
      storyboard_breaker: () => ({ saveStoryboards: true }),
      grid_prompt_generator: () => ({ generateGridPrompt: true }),
    },
  )

  assert.equal(tools, null)
})
