import assert from 'node:assert/strict'

import {
  normalizeAgentResult,
  wasToolUsed,
} from '../../agents/result-normalizer.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('normalizeAgentResult does not treat generic tool-call event type as a tool name', () => {
  const normalized = normalizeAgentResult({
    toolCalls: [
      { type: 'tool-call', toolCallId: 'call-read', args: {} },
      { type: 'tool-call', toolCallId: 'call-append', args: {} },
    ],
    toolResults: [
      { type: 'tool-result', result: { script: 'chunk script' } },
      {
        type: 'tool-result',
        result: {
          message: 'Appended 12 storyboards',
          count: 12,
          start_number: 1,
          total_duration: 144,
        },
      },
    ],
  })

  assert.deepEqual(normalized.toolCalls.map((toolCall) => toolCall.toolName), [null, null])
})

runTest('wasToolUsed recognizes append_storyboards from successful append result payload', () => {
  const normalized = normalizeAgentResult({
    toolCalls: [
      { type: 'tool-call', toolCallId: 'call-read', args: {} },
      { type: 'tool-call', toolCallId: 'call-append', args: {} },
    ],
    toolResults: [
      { type: 'tool-result', result: { script: 'chunk script' } },
      {
        type: 'tool-result',
        result: {
          message: 'Appended 12 storyboards',
          count: 12,
          start_number: 1,
          total_duration: 144,
        },
      },
    ],
  })

  assert.equal(wasToolUsed(normalized, 'append_storyboards'), true)
})

runTest('normalizeAgentResult reads Mastra chunk payload tool names and results', () => {
  const normalized = normalizeAgentResult({
    toolCalls: [
      {
        type: 'tool-call',
        payload: {
          toolCallId: 'call-append',
          toolName: 'append_storyboards',
          args: { storyboards: [] },
        },
      },
    ],
    toolResults: [
      {
        type: 'tool-result',
        payload: {
          toolCallId: 'call-append',
          toolName: 'append_storyboards',
          result: {
            message: 'Appended 7 storyboards',
            count: 7,
            start_number: 1,
            total_duration: 99,
          },
        },
      },
    ],
  })

  assert.deepEqual(normalized.toolCalls.map((toolCall) => toolCall.toolName), ['append_storyboards'])
  assert.deepEqual(normalized.toolResults.map((toolResult) => toolResult.toolName), ['append_storyboards'])
  assert.equal(wasToolUsed(normalized, 'append_storyboards'), true)
})

runTest('normalizeAgentResult ignores malformed non-array tool collections', () => {
  const normalized = normalizeAgentResult({
    text: null,
    toolCalls: { toolName: 'append_storyboards' },
    toolResults: { toolName: 'append_storyboards' },
  })

  assert.equal(normalized.text, '')
  assert.deepEqual(normalized.toolCalls, [])
  assert.deepEqual(normalized.toolResults, [])
})

runTest('normalizeAgentResult serializes missing tool result payloads as null', () => {
  const normalized = normalizeAgentResult({
    toolResults: [
      {
        type: 'tool-result',
        payload: {
          toolName: 'append_storyboards',
        },
      },
    ],
  })

  assert.equal(normalized.toolResults[0]?.toolName, 'append_storyboards')
  assert.equal(normalized.toolResults[0]?.result, 'null')
})
